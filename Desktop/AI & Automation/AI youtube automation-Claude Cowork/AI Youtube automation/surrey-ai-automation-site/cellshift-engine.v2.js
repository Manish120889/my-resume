"use strict";

const CSEngine = (() => {
  let original = { headers: [], rows: [] };
  let steps = [];
  let cache = {};
  const TABLES = {};
  let stepIdCounter = 1;

  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
  const isNum = (v) => !isBlank(v) && !isNaN(parseFloat(String(v).replace(/[$,%]/g, ""))) && isFinite(String(v).replace(/[$,%]/g, ""));

  const ops = {
    dedupe: {
      fn: (table) => {
        const seen = new Set();
        return { ...table, rows: table.rows.filter(r => {
          const key = JSON.stringify(r);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })};
      },
      labelFn: () => "Remove duplicate rows"
    },
    removeBlankRows: {
      fn: (table) => ({
        ...table,
        rows: table.rows.filter(r => !r.every(isBlank))
      }),
      labelFn: () => "Remove blank rows"
    },
    removeBlankCols: {
      fn: (table) => {
        const keep = table.headers.map((_, i) =>
          table.rows.some(r => !isBlank(r[i])) || !isBlank(table.headers[i])
        );
        return {
          headers: table.headers.filter((_, i) => keep[i]),
          rows: table.rows.map(r => r.filter((_, i) => keep[i]))
        };
      },
      labelFn: () => "Remove blank columns"
    },
    trim: {
      fn: (table) => ({
        ...table,
        rows: table.rows.map(r => r.map(c => typeof c === "string" ? c.trim() : c))
      }),
      labelFn: () => "Trim whitespace"
    },
    standardizeDates: {
      fn: (table) => ({
        ...table,
        rows: table.rows.map(r => r.map(c => {
          if (isBlank(c) || isNum(c)) return c;
          const d = new Date(c);
          if (!isNaN(d) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(String(c)))
            return d.toISOString().slice(0, 10);
          return c;
        }))
      }),
      labelFn: () => "Standardize dates"
    },
    cleanColNames: {
      fn: (table) => ({
        ...table,
        headers: table.headers.map(h => h.replace(/[^\w\s]/g, "").trim().replace(/\s+/g, "_"))
      }),
      labelFn: () => "Clean column names"
    },
    rename: {
      fn: (table, { colIndex, newName }) => ({
        ...table,
        headers: table.headers.map((h, i) => i === colIndex ? newName : h)
      }),
      labelFn: (p) => `Rename column to "${p.newName}"`
    },
    remove: {
      fn: (table, { colIndex }) => ({
        headers: table.headers.filter((_, i) => i !== colIndex),
        rows: table.rows.map(r => r.filter((_, i) => i !== colIndex))
      }),
      labelFn: (p, t) => `Remove column "${t.headers[p.colIndex] || ""}"`
    },
    reorder: {
      fn: (table, { order }) => ({
        headers: order.map(i => table.headers[i]),
        rows: table.rows.map(r => order.map(i => r[i]))
      }),
      labelFn: () => "Reorder columns"
    },
    changeType: {
      fn: (table, { colIndex, type }) => ({
        ...table,
        rows: table.rows.map(r => {
          const v = r[colIndex];
          if (isBlank(v)) return r;
          const res = [...r];
          if (type === "number") {
            res[colIndex] = parseFloat(String(v).replace(/[$,%]/g, "")) || null;
          } else if (type === "date") {
            const d = new Date(v);
            res[colIndex] = isNaN(d) ? null : d.toISOString().slice(0, 10);
          } else if (type === "text") {
            res[colIndex] = String(v);
          }
          return res;
        })
      }),
      labelFn: (p, t) => `Change "${t.headers[p.colIndex]}" to ${p.type}`
    },
    fillDown: {
      fn: (table, { colIndex }) => {
        const rows = JSON.parse(JSON.stringify(table.rows));
        let last = null;
        for (let i = 0; i < rows.length; i++) {
          if (!isBlank(rows[i][colIndex])) last = rows[i][colIndex];
          else if (last !== null) rows[i][colIndex] = last;
        }
        return { ...table, rows };
      },
      labelFn: (p, t) => `Fill down "${t.headers[p.colIndex]}"`
    },
    fillUp: {
      fn: (table, { colIndex }) => {
        const rows = JSON.parse(JSON.stringify(table.rows));
        let last = null;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (!isBlank(rows[i][colIndex])) last = rows[i][colIndex];
          else if (last !== null) rows[i][colIndex] = last;
        }
        return { ...table, rows };
      },
      labelFn: (p, t) => `Fill up "${t.headers[p.colIndex]}"`
    },
    replaceValues: {
      fn: (table, { colIndex, find, replace }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          if (!isBlank(res[colIndex])) res[colIndex] = String(res[colIndex]).split(find).join(replace);
          return res;
        })
      }),
      labelFn: (p, t) => `Replace "${p.find}" with "${p.replace}" in "${t.headers[p.colIndex]}"`
    },
    splitByDelimiter: {
      fn: (table, { colIndex, delimiter }) => {
        const base = table.headers[colIndex];
        const max = Math.max(...table.rows.map(r => isBlank(r[colIndex]) ? 1 : String(r[colIndex]).split(delimiter).length), 1);
        if (max < 2) throw new Error("Nothing to split with that delimiter");
        const newHeads = Array.from({ length: max }, (_, k) => `${base}_part${k + 1}`);
        return {
          headers: [...table.headers.slice(0, colIndex + 1), ...newHeads, ...table.headers.slice(colIndex + 1)],
          rows: table.rows.map(r => {
            const parts = isBlank(r[colIndex]) ? [] : String(r[colIndex]).split(delimiter).map(s => s.trim());
            const cells = Array.from({ length: max }, (_, k) => parts[k] ?? "");
            return [...r.slice(0, colIndex + 1), ...cells, ...r.slice(colIndex + 1)];
          })
        };
      },
      labelFn: (p, t) => `Split "${t.headers[p.colIndex]}" by "${p.delimiter}"`
    },
    splitByPositions: {
      fn: (table, { colIndex, positions }) => {
        const base = table.headers[colIndex];
        const newHeads = Array.from({ length: positions.length }, (_, k) => `${base}_part${k + 1}`);
        return {
          headers: [...table.headers.slice(0, colIndex + 1), ...newHeads, ...table.headers.slice(colIndex + 1)],
          rows: table.rows.map(r => {
            const v = String(r[colIndex] ?? "");
            const cells = positions.map((p, i) => v.substring(p[0], p[1] ?? v.length));
            return [...r.slice(0, colIndex + 1), ...cells, ...r.slice(colIndex + 1)];
          })
        };
      },
      labelFn: (p, t) => `Split "${t.headers[p.colIndex]}" by positions`
    },
    extract: {
      fn: (table, { colIndex, type, count }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          const v = String(r[colIndex] ?? "");
          if (type === "first") res[colIndex] = v.substring(0, count);
          else if (type === "last") res[colIndex] = v.substring(Math.max(0, v.length - count));
          return res;
        })
      }),
      labelFn: (p, t) => `Extract ${p.type} ${p.count} chars from "${t.headers[p.colIndex]}"`
    },
    mergeColumns: {
      fn: (table, { colIndices, separator }) => {
        const newName = colIndices.map(i => table.headers[i]).join(" ");
        const newHeaders = table.headers.filter((_, i) => !colIndices.includes(i));
        newHeaders.push(newName);
        return {
          headers: newHeaders,
          rows: table.rows.map(r => {
            const merged = colIndices.map(i => r[i] ?? "").join(separator);
            const filtered = r.filter((_, i) => !colIndices.includes(i));
            return [...filtered, merged];
          })
        };
      },
      labelFn: (p, t) => `Merge columns with "${p.separator}"`
    },
    textCase: {
      fn: (table, { colIndex, case: caseType }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          const v = String(r[colIndex] ?? "");
          if (caseType === "upper") res[colIndex] = v.toUpperCase();
          else if (caseType === "lower") res[colIndex] = v.toLowerCase();
          else if (caseType === "proper") res[colIndex] = v.split(/\s+/).map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          return res;
        })
      }),
      labelFn: (p, t) => `Convert "${t.headers[p.colIndex]}" to ${p.case} case`
    },
    pad: {
      fn: (table, { colIndex, length, padChar, side }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          const v = String(r[colIndex] ?? "");
          res[colIndex] = side === "left" ? v.padStart(length, padChar) : v.padEnd(length, padChar);
          return res;
        })
      }),
      labelFn: (p, t) => `Pad "${t.headers[p.colIndex]}" to ${p.length} chars`
    },
    round: {
      fn: (table, { colIndex, decimals }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          if (isNum(r[colIndex])) {
            const n = parseFloat(String(r[colIndex]).replace(/[$,%]/g, ""));
            res[colIndex] = Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
          }
          return res;
        })
      }),
      labelFn: (p, t) => `Round "${t.headers[p.colIndex]}" to ${p.decimals} decimals`
    },
    datePart: {
      fn: (table, { colIndex, part }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          if (!isBlank(r[colIndex])) {
            const d = new Date(r[colIndex]);
            if (!isNaN(d)) {
              if (part === "year") res[colIndex] = d.getFullYear();
              else if (part === "month") res[colIndex] = d.getMonth() + 1;
              else if (part === "monthName") res[colIndex] = d.toLocaleDateString("en", { month: "long" });
              else if (part === "day") res[colIndex] = d.getDate();
              else if (part === "quarter") res[colIndex] = Math.ceil((d.getMonth() + 1) / 3);
              else if (part === "week") res[colIndex] = Math.ceil((d.getDate() + new Date(d.getFullYear(), 0, 1).getDay()) / 7);
            }
          }
          return res;
        })
      }),
      labelFn: (p, t) => `Extract ${p.part} from "${t.headers[p.colIndex]}"`
    },
    numberFormat: {
      fn: (table, { colIndex, format }) => ({
        ...table,
        rows: table.rows.map(r => {
          const res = [...r];
          if (isNum(r[colIndex])) {
            const n = parseFloat(String(r[colIndex]).replace(/[$,%]/g, ""));
            if (format === "currency") res[colIndex] = "$" + n.toFixed(2);
            else if (format === "percent") res[colIndex] = (n * 100).toFixed(2) + "%";
            else if (format === "thousands") res[colIndex] = n.toLocaleString();
          }
          return res;
        })
      }),
      labelFn: (p, t) => `Format "${t.headers[p.colIndex]}" as ${p.format}`
    },
    filter: {
      fn: (table, { conditions, combineWith }) => {
        const cmps = {
          equals: (a, b) => String(a) === String(b),
          notEquals: (a, b) => String(a) !== String(b),
          contains: (a, b) => String(a ?? "").toLowerCase().includes(String(b).toLowerCase()),
          notContains: (a, b) => !String(a ?? "").toLowerCase().includes(String(b).toLowerCase()),
          gt: (a, b) => parseFloat(String(a).replace(/[$,%]/g, "")) > parseFloat(b),
          gte: (a, b) => parseFloat(String(a).replace(/[$,%]/g, "")) >= parseFloat(b),
          lt: (a, b) => parseFloat(String(a).replace(/[$,%]/g, "")) < parseFloat(b),
          lte: (a, b) => parseFloat(String(a).replace(/[$,%]/g, "")) <= parseFloat(b),
          isEmpty: (a) => isBlank(a),
          notEmpty: (a) => !isBlank(a),
          between: (a, b1, b2) => {
            const n = parseFloat(String(a).replace(/[$,%]/g, ""));
            return n >= parseFloat(b1) && n <= parseFloat(b2);
          }
        };
        return {
          ...table,
          rows: table.rows.filter(r => {
            const results = conditions.map(c => {
              const val = r[c.colIndex];
              if (c.cmp === "between") return cmps.between(val, c.value[0], c.value[1]);
              return cmps[c.cmp]?.(val, c.value) ?? false;
            });
            return combineWith === "and" ? results.every(x => x) : results.some(x => x);
          })
        };
      },
      labelFn: () => "Filter rows"
    },
    sortMulti: {
      fn: (table, { sorts }) => {
        const rows = JSON.parse(JSON.stringify(table.rows));
        rows.sort((a, b) => {
          for (const s of sorts) {
            const aval = a[s.colIndex] ?? "", bval = b[s.colIndex] ?? "";
            const anum = parseFloat(String(aval).replace(/[$,%]/g, ""));
            const bnum = parseFloat(String(bval).replace(/[$,%]/g, ""));
            let cmp = 0;
            if (isNum(aval) && isNum(bval)) cmp = anum - bnum;
            else cmp = String(aval).localeCompare(String(bval));
            if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
          }
          return 0;
        });
        return { ...table, rows };
      },
      labelFn: () => "Sort rows"
    },
    keepTopN: {
      fn: (table, { n }) => ({
        ...table,
        rows: table.rows.slice(0, n)
      }),
      labelFn: (p) => `Keep top ${p.n} rows`
    },
    removeTopN: {
      fn: (table, { n }) => ({
        ...table,
        rows: table.rows.slice(n)
      }),
      labelFn: (p) => `Remove top ${p.n} rows`
    },
    removeBottomN: {
      fn: (table, { n }) => ({
        ...table,
        rows: table.rows.slice(0, -n)
      }),
      labelFn: (p) => `Remove bottom ${p.n} rows`
    },
    firstRowAsHeaders: {
      fn: (table) => {
        if (table.rows.length === 0) return table;
        return {
          headers: table.rows[0],
          rows: table.rows.slice(1)
        };
      },
      labelFn: () => "Use first row as headers"
    },
    transpose: {
      fn: (table) => {
        if (table.rows.length === 0) return table;
        const newRows = table.headers.map((_, i) => [table.headers[i], ...table.rows.map(r => r[i] ?? "")]);
        return {
          headers: ["Field", ...Array.from({ length: table.rows.length }, (_, i) => `Col${i + 1}`)],
          rows: newRows
        };
      },
      labelFn: () => "Transpose table"
    },
    groupBy: {
      fn: (table, { groupCols, aggs }) => {
        const groups = new Map();
        table.rows.forEach(r => {
          const key = groupCols.map(i => r[i]).join("|");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        });
        const headers = groupCols.map(i => table.headers[i]).concat(aggs.map(a => a.col ? table.headers[a.col] + "_" + a.fn : a.name || "agg"));
        const rows = Array.from(groups.entries()).map(([key, group]) => {
          const keyParts = key.split("|");
          const agg = aggs.map(a => {
            const col = group.map(r => r[a.col] ?? 0);
            if (a.fn === "sum") return col.reduce((x, y) => x + parseFloat(y), 0);
            if (a.fn === "avg") return col.reduce((x, y) => x + parseFloat(y), 0) / col.length;
            if (a.fn === "min") return Math.min(...col.map(v => parseFloat(v)));
            if (a.fn === "max") return Math.max(...col.map(v => parseFloat(v)));
            if (a.fn === "count") return group.length;
            if (a.fn === "countDistinct") return new Set(col).size;
            return null;
          });
          return [...keyParts, ...agg];
        });
        return { headers, rows };
      },
      labelFn: () => "Group by and aggregate"
    },
    pivot: {
      fn: (table, { rowCol, colCol, valueCol, aggFn }) => {
        const pivot = new Map();
        const rowVals = new Set(), colVals = new Set();
        table.rows.forEach(r => {
          const rkey = r[rowCol], ckey = r[colCol];
          rowVals.add(rkey); colVals.add(ckey);
          const pkey = `${rkey}|${ckey}`;
          if (!pivot.has(pkey)) pivot.set(pkey, []);
          pivot.get(pkey).push(r[valueCol]);
        });
        const colArray = Array.from(colVals).sort();
        const headers = [table.headers[rowCol], ...colArray];
        const rows = Array.from(rowVals).sort().map(rv => {
          const row = [rv];
          for (const cv of colArray) {
            const vals = pivot.get(`${rv}|${cv}`) || [0];
            if (aggFn === "sum") row.push(vals.reduce((a, b) => a + parseFloat(b), 0));
            else if (aggFn === "avg") row.push(vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length);
            else if (aggFn === "count") row.push(vals.length);
            else row.push(vals[0]);
          }
          return row;
        });
        return { headers, rows };
      },
      labelFn: () => "Pivot table"
    },
    unpivot: {
      fn: (table, { idCols, varName, valName }) => {
        const valueInds = table.headers.map((_, i) => !idCols.includes(i) ? i : -1).filter(i => i >= 0);
        const headers = [...idCols.map(i => table.headers[i]), varName, valName];
        const rows = [];
        table.rows.forEach(r => {
          const idVals = idCols.map(i => r[i]);
          valueInds.forEach(vi => {
            rows.push([...idVals, table.headers[vi], r[vi]]);
          });
        });
        return { headers, rows };
      },
      labelFn: () => "Unpivot table"
    },
    appendTable: {
      fn: (table, { tableName }) => {
        const other = TABLES[tableName];
        if (!other || !other.rows) return table;
        return {
          ...table,
          rows: [...table.rows, ...other.rows]
        };
      },
      labelFn: (p) => `Append "${p.tableName}"`
    },
    mergeTables: {
      fn: (table, { tableName, leftKey, rightKey, joinType, pickCols }) => {
        const other = TABLES[tableName];
        if (!other) return table;
        const rightIdx = new Map();
        other.rows.forEach(r => rightIdx.set(String(r[rightKey]), r));
        const result = [];
        table.rows.forEach(lr => {
          const rr = rightIdx.get(String(lr[leftKey]));
          if (joinType === "inner" && !rr) return;
          if (joinType === "left" || (joinType === "inner" && rr)) {
            const row = [...lr];
            if (rr) pickCols.forEach(i => row.push(rr[i]));
            result.push(row);
          }
        });
        if (joinType === "full" && rightIdx.size > 0) {
          const used = new Set(table.rows.map(r => String(r[leftKey])));
          rightIdx.forEach((rr, key) => {
            if (!used.has(key)) {
              const row = Array(leftKey + 1).fill(null);
              row[leftKey] = key;
              pickCols.forEach(i => row.push(rr[i]));
              result.push(row);
            }
          });
        }
        const headers = [...table.headers, ...pickCols.map(i => other.headers[i])];
        return { headers, rows: result };
      },
      labelFn: (p) => `Merge with "${p.tableName}"`
    },
    addCustomColumn: {
      fn: (table, { name, formula }) => {
        if (!window.CSFormulas) throw new Error("CSFormulas not loaded");
        return {
          ...table,
          headers: [...table.headers, name],
          rows: table.rows.map(r => {
            try {
              const colMap = Object.fromEntries(table.headers.map((h, i) => [h, r[i]]));
              const val = window.CSFormulas.eval(formula, colMap);
              return [...r, val];
            } catch (e) {
              return [...r, `#ERROR: ${e.message}`];
            }
          })
        };
      },
      labelFn: (p) => `Add column "${p.name}"`
    }
  };

  const applySteps = (tbl, stps) => {
    let result = JSON.parse(JSON.stringify(tbl));
    stps.forEach((step, idx) => {
      if (!ops[step.op]) throw new Error(`Unknown op: ${step.op}`);
      try {
        result = ops[step.op].fn(result, step.params, result);
        cache[idx] = JSON.parse(JSON.stringify(result));
      } catch (e) {
        throw new Error(`Step "${step.label}" failed: ${e.message}`);
      }
    });
    return result;
  };

  return {
    init: (table) => { original = JSON.parse(JSON.stringify(table)); steps = []; cache = {}; },
    addStep: (op, params, label) => {
      const id = stepIdCounter++;
      const lbl = label || (ops[op]?.labelFn?.(params, original) || op);
      steps.push({ id, op, params, label: lbl });
      cache = {};
      return id;
    },
    removeStep: (id) => {
      const idx = steps.findIndex(s => s.id === id);
      if (idx >= 0) { steps.splice(idx, 1); cache = {}; }
    },
    moveStep: (id, dir) => {
      const idx = steps.findIndex(s => s.id === id);
      if (idx >= 0) {
        const newIdx = dir === "up" ? idx - 1 : idx + 1;
        if (newIdx >= 0 && newIdx < steps.length) {
          [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
          cache = {};
        }
      }
    },
    previewAt: (index) => {
      if (index < 0 || index >= steps.length) return JSON.parse(JSON.stringify(original));
      return applySteps(original, steps.slice(0, index + 1));
    },
    getAll: () => applySteps(original, steps),
    getSteps: () => JSON.parse(JSON.stringify(steps)),
    undo: () => { if (steps.length) { steps.pop(); cache = {}; } },
    reset: () => { steps = []; cache = {}; },
    saveRecipe: (name) => {
      const recipes = JSON.parse(localStorage.getItem("cs_recipes") || "{}");
      recipes[name] = JSON.parse(JSON.stringify(steps));
      localStorage.setItem("cs_recipes", JSON.stringify(recipes));
    },
    listRecipes: () => Object.keys(JSON.parse(localStorage.getItem("cs_recipes") || "{}")),
    runRecipe: (name) => {
      const recipes = JSON.parse(localStorage.getItem("cs_recipes") || "{}");
      const recipe = recipes[name];
      if (!recipe) throw new Error("Recipe not found");
      steps = JSON.parse(JSON.stringify(recipe));
      cache = {};
      return applySteps(original, steps);
    },
    deleteRecipe: (name) => {
      const recipes = JSON.parse(localStorage.getItem("cs_recipes") || "{}");
      delete recipes[name];
      localStorage.setItem("cs_recipes", JSON.stringify(recipes));
    },
    addSecondaryTable: (name, table) => {
      TABLES[name] = JSON.parse(JSON.stringify(table));
    },
    getSecondaryTables: () => Object.keys(TABLES)
  };
})();
