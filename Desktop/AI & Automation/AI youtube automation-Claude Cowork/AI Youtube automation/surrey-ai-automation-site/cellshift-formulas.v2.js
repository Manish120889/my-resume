"use strict";

const CSFormulas = (() => {
  const FUNC_REGEX = /^([A-Z_][A-Z0-9_]*)\s*\(/i;
  const CELL_REGEX = /\[([^\[\]]+)\]/g;
  const NUM_REGEX = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

  const tokenize = (str) => {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
      if (/\s/.test(str[i])) { i++; continue; }
      if (str[i] === "(") { tokens.push({ type: "paren", val: "(" }); i++; }
      else if (str[i] === ")") { tokens.push({ type: "paren", val: ")" }); i++; }
      else if (str[i] === ",") { tokens.push({ type: "comma", val: "," }); i++; }
      else if (str[i] === '"' || str[i] === "'") {
        const q = str[i];
        let val = "";
        i++;
        while (i < str.length && str[i] !== q) { val += str[i]; i++; }
        i++;
        tokens.push({ type: "string", val });
      } else if (str[i] === "[") {
        let val = "";
        i++;
        while (i < str.length && str[i] !== "]") { val += str[i]; i++; }
        i++;
        tokens.push({ type: "cellref", val });
      } else if (/[+\-*/%^&=<>]/.test(str[i])) {
        let op = str[i];
        if (i + 1 < str.length && (str[i] === "<" || str[i] === ">") && str[i + 1] === "=") { op += "="; i++; }
        else if (i + 1 < str.length && str[i] === "<" && str[i + 1] === ">") { op = "<>"; i++; }
        i++;
        tokens.push({ type: "op", val: op });
      } else if (/[A-Za-z_]/.test(str[i])) {
        let val = "";
        while (i < str.length && /[A-Za-z0-9_]/.test(str[i])) { val += str[i]; i++; }
        tokens.push({ type: "ident", val });
      } else if (/\d/.test(str[i]) || (str[i] === "." && /\d/.test(str[i + 1]))) {
        let val = "";
        while (i < str.length && /[\d.]/.test(str[i])) { val += str[i]; i++; }
        tokens.push({ type: "number", val });
      } else { i++; }
    }
    return tokens;
  };

  const parse = (tokens, colMap) => {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    const parseExpr = () => parseOr();
    const parseOr = () => {
      let left = parseAnd();
      while (peek() && peek().type === "ident" && peek().val.toUpperCase() === "OR") {
        consume();
        const right = parseAnd();
        left = { type: "call", func: "OR", args: [left, right] };
      }
      return left;
    };
    const parseAnd = () => {
      let left = parseComp();
      while (peek() && peek().type === "ident" && peek().val.toUpperCase() === "AND") {
        consume();
        const right = parseComp();
        left = { type: "call", func: "AND", args: [left, right] };
      }
      return left;
    };
    const parseComp = () => {
      let left = parseConcat();
      while (peek() && peek().type === "op" && /^(<|>|=|<>|<=|>=)$/.test(peek().val)) {
        const op = consume().val;
        const right = parseConcat();
        left = { type: "call", func: op === "=" ? "EQ" : op === "<>" ? "NE" : op === ">" ? "GT" : op === "<" ? "LT" : op === ">=" ? "GTE" : "LTE", args: [left, right] };
      }
      return left;
    };
    const parseConcat = () => {
      let left = parseAdd();
      while (peek() && peek().type === "op" && peek().val === "&") {
        consume();
        const right = parseAdd();
        left = { type: "call", func: "CONCAT", args: [left, right] };
      }
      return left;
    };
    const parseAdd = () => {
      let left = parseMul();
      while (peek() && peek().type === "op" && /^[+\-]$/.test(peek().val)) {
        const op = consume().val;
        const right = parseMul();
        left = { type: "call", func: op === "+" ? "ADD" : "SUBTRACT", args: [left, right] };
      }
      return left;
    };
    const parseMul = () => {
      let left = parsePow();
      while (peek() && peek().type === "op" && /^[*/%]$/.test(peek().val)) {
        const op = consume().val;
        const right = parsePow();
        left = { type: "call", func: op === "*" ? "MULTIPLY" : op === "/" ? "DIVIDE" : "MOD", args: [left, right] };
      }
      return left;
    };
    const parsePow = () => {
      let left = parseUnary();
      while (peek() && peek().type === "op" && peek().val === "^") {
        consume();
        const right = parseUnary();
        left = { type: "call", func: "POWER", args: [left, right] };
      }
      return left;
    };
    const parseUnary = () => {
      if (peek() && peek().type === "op" && peek().val === "-") {
        consume();
        return { type: "call", func: "NEGATE", args: [parseUnary()] };
      }
      if (peek() && peek().type === "op" && peek().val === "+") { consume(); }
      return parsePrimary();
    };
    const parsePrimary = () => {
      const t = peek();
      if (!t) throw new Error("Unexpected end");
      if (t.type === "number") return { type: "number", val: parseFloat(consume().val) };
      if (t.type === "string") return { type: "string", val: consume().val };
      if (t.type === "cellref") {
        const ref = consume().val;
        return { type: "cellref", val: colMap[ref] ?? null };
      }
      if (t.type === "paren" && t.val === "(") {
        consume();
        const expr = parseExpr();
        if (!peek() || peek().type !== "paren" || peek().val !== ")") throw new Error("Missing )");
        consume();
        return expr;
      }
      if (t.type === "ident") {
        const fname = consume().val.toUpperCase();
        if (peek() && peek().type === "paren" && peek().val === "(") {
          consume();
          const args = [];
          while (peek() && !(peek().type === "paren" && peek().val === ")")) {
            args.push(parseExpr());
            if (peek() && peek().type === "comma") consume();
          }
          if (!peek() || peek().type !== "paren" || peek().val !== ")") throw new Error("Missing )");
          consume();
          return { type: "call", func: fname, args };
        }
        return { type: "call", func: fname, args: [] };
      }
      throw new Error(`Unexpected token: ${t.val}`);
    };
    return parseExpr();
  };

  const evaluate = (ast, colMap, tables) => {
    if (!ast) return null;
    if (ast.type === "number") return ast.val;
    if (ast.type === "string") return ast.val;
    if (ast.type === "cellref") {
      const v = ast.val;
      if (v === null) return "#N/A";
      if (typeof v === "string") return v;
      return v;
    }
    if (ast.type === "call") {
      const args = ast.args.map(a => evaluate(a, colMap, tables));
      return callFunc(ast.func, args, colMap, tables);
    }
    return null;
  };

  const callFunc = (fname, args, colMap, tables) => {
    try {
      if (fname === "IF") return args[0] ? args[1] : (args[2] ?? false);
      if (fname === "IFS") {
        for (let i = 0; i < args.length; i += 2) {
          if (args[i]) return args[i + 1];
        }
        return null;
      }
      if (fname === "AND") return args.every(x => x);
      if (fname === "OR") return args.some(x => x);
      if (fname === "NOT") return !args[0];
      if (fname === "IFERROR") return args[0] instanceof Error || typeof args[0] === "string" && args[0].startsWith("#") ? args[1] : args[0];
      if (fname === "EQ") return args[0] === args[1];
      if (fname === "NE") return args[0] !== args[1];
      if (fname === "LT") return args[0] < args[1];
      if (fname === "LTE") return args[0] <= args[1];
      if (fname === "GT") return args[0] > args[1];
      if (fname === "GTE") return args[0] >= args[1];
      if (fname === "ADD") return (args[0] ?? 0) + (args[1] ?? 0);
      if (fname === "SUBTRACT") return (args[0] ?? 0) - (args[1] ?? 0);
      if (fname === "MULTIPLY") return (args[0] ?? 0) * (args[1] ?? 0);
      if (fname === "DIVIDE") return args[1] === 0 ? "#DIV/0!" : (args[0] ?? 0) / (args[1] ?? 0);
      if (fname === "POWER") return Math.pow(args[0] ?? 0, args[1] ?? 0);
      if (fname === "NEGATE") return -(args[0] ?? 0);
      if (fname === "MOD") return (args[0] ?? 0) % (args[1] ?? 1);
      if (fname === "SUM") return args.reduce((a, b) => a + (parseFloat(b) || 0), 0);
      if (fname === "AVERAGE" || fname === "AVG") return args.length ? args.reduce((a, b) => a + (parseFloat(b) || 0), 0) / args.length : 0;
      if (fname === "MIN") return Math.min(...args.map(x => parseFloat(x) || 0));
      if (fname === "MAX") return Math.max(...args.map(x => parseFloat(x) || 0));
      if (fname === "COUNT") return args.filter(x => !isNaN(parseFloat(x))).length;
      if (fname === "COUNTA") return args.filter(x => x !== null && x !== undefined && x !== "").length;
      if (fname === "COUNTUNIQUE") return new Set(args).size;
      if (fname === "ROUND") return Math.round((args[0] ?? 0) * Math.pow(10, args[1] ?? 0)) / Math.pow(10, args[1] ?? 0);
      if (fname === "ROUNDUP") return Math.ceil((args[0] ?? 0) * Math.pow(10, args[1] ?? 0)) / Math.pow(10, args[1] ?? 0);
      if (fname === "ROUNDDOWN") return Math.floor((args[0] ?? 0) * Math.pow(10, args[1] ?? 0)) / Math.pow(10, args[1] ?? 0);
      if (fname === "ABS") return Math.abs(args[0] ?? 0);
      if (fname === "INT") return Math.floor(args[0] ?? 0);
      if (fname === "CONCAT" || fname === "CONCATENATE") return args.map(x => String(x ?? "")).join("");
      if (fname === "TEXTJOIN") {
        const sep = args[0], skip = args[1], strs = args.slice(2);
        return strs.filter(x => skip ? x !== "" : true).map(x => String(x ?? "")).join(sep);
      }
      if (fname === "LEFT") return String(args[0] ?? "").substring(0, args[1] ?? 0);
      if (fname === "RIGHT") {
        const s = String(args[0] ?? "");
        return s.substring(Math.max(0, s.length - (args[1] ?? 0)));
      }
      if (fname === "MID") return String(args[0] ?? "").substring((args[1] ?? 0) - 1, (args[1] ?? 0) + (args[2] ?? 0) - 1);
      if (fname === "LEN") return String(args[0] ?? "").length;
      if (fname === "TRIM") return String(args[0] ?? "").trim();
      if (fname === "UPPER") return String(args[0] ?? "").toUpperCase();
      if (fname === "LOWER") return String(args[0] ?? "").toLowerCase();
      if (fname === "PROPER") return String(args[0] ?? "").split(/\s+/).map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      if (fname === "SUBSTITUTE") return String(args[0] ?? "").split(String(args[1] ?? "")).join(String(args[2] ?? ""));
      if (fname === "REPLACE") return String(args[0] ?? "").substring(0, (args[1] ?? 0) - 1) + String(args[3] ?? "") + String(args[0] ?? "").substring((args[1] ?? 0) + (args[2] ?? 0) - 1);
      if (fname === "FIND" || fname === "SEARCH") return String(args[0] ?? "").indexOf(String(args[1] ?? "")) + 1;
      if (fname === "TEXT") {
        const val = args[0], fmt = String(args[1] ?? "");
        if (fmt.includes("0.00")) return parseFloat(val).toFixed(2);
        if (fmt.includes("%")) return (parseFloat(val) * 100).toFixed(0) + "%";
        return String(val);
      }
      if (fname === "VALUE") return parseFloat(args[0]) || 0;
      if (fname === "DATE") return new Date(args[0], (args[1] || 1) - 1, args[2]).toISOString().slice(0, 10);
      if (fname === "TODAY") return new Date().toISOString().slice(0, 10);
      if (fname === "NOW") return new Date().toISOString();
      if (fname === "YEAR") return new Date(args[0]).getFullYear();
      if (fname === "MONTH") return new Date(args[0]).getMonth() + 1;
      if (fname === "DAY") return new Date(args[0]).getDate();
      if (fname === "QUARTER") return Math.ceil((new Date(args[0]).getMonth() + 1) / 3);
      if (fname === "WEEKDAY") return new Date(args[0]).getDay();
      if (fname === "WEEKNUM") return Math.ceil((new Date(args[0]).getDate() + new Date(args[0].split("-")[0], 0, 1).getDay()) / 7);
      if (fname === "EOMONTH") {
        const d = new Date(args[0]);
        d.setMonth(d.getMonth() + (args[1] || 0) + 1, 0);
        return d.toISOString().slice(0, 10);
      }
      if (fname === "SUMIF") {
        const cond = args[0], col = args[1];
        return args.length > 2 ? col.reduce((a, b, i) => b === cond ? a + parseFloat(args[2][i] || 0) : a, 0) : 0;
      }
      if (fname === "COUNTIF") return args[0].filter(x => x === args[1]).length;
      if (fname === "AVERAGEIF") {
        const cond = args[0], col = args[1], vals = args[2] || col;
        const match = vals.filter((v, i) => col[i] === cond);
        return match.length ? match.reduce((a, b) => a + parseFloat(b), 0) / match.length : 0;
      }
      const toRows = t => Array.isArray(t) ? t : (t && Array.isArray(t.rows) ? t.rows : null);
      const looseEq = (a, b) => a === b || String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
      if (fname === "VLOOKUP") {
        const lookup = args[0], rows = toRows(args[1]), colIdx = (args[2] ?? 1) - 1, exact = args[3] !== false;
        if (!rows || !rows.length) return "#N/A";
        for (const row of rows) {
          if (exact ? looseEq(row[0], lookup) : String(row[0]).startsWith(String(lookup))) {
            return row[colIdx] ?? null;
          }
        }
        return "#N/A";
      }
      if (fname === "HLOOKUP") {
        const lookup = args[0], rows = toRows(args[1]), rowIdx = (args[2] ?? 1) - 1, exact = args[3] !== false;
        if (!rows || !rows.length) return "#N/A";
        const first = rows[0];
        for (let c = 0; c < first.length; c++) {
          if (exact ? looseEq(first[c], lookup) : String(first[c]).startsWith(String(lookup))) {
            return rows[rowIdx]?.[c] ?? null;
          }
        }
        return "#N/A";
      }
      if (fname === "XLOOKUP") {
        const lookup = args[0], lookupArr = args[1], returnArr = args[2], ifNotFound = args.length > 3 ? args[3] : "#N/A";
        if (!Array.isArray(lookupArr) || !Array.isArray(returnArr)) return "#ERROR: XLOOKUP needs COL() ranges";
        for (let i = 0; i < lookupArr.length; i++) {
          if (looseEq(lookupArr[i], lookup)) return returnArr[i] ?? null;
        }
        return ifNotFound;
      }
      if (fname === "LOOKUP") {
        const lookup = args[0], lookupArr = args[1], resultArr = args[2] || args[1];
        if (!Array.isArray(lookupArr)) return "#N/A";
        for (let i = 0; i < lookupArr.length; i++) {
          if (looseEq(lookupArr[i], lookup)) return resultArr[i] ?? null;
        }
        return "#N/A";
      }
      if (fname === "CHOOSE") {
        const idx = Math.floor(args[0]);
        return idx >= 1 && idx < args.length ? args[idx] : "#VALUE!";
      }
      if (fname === "INDEX") {
        const src = args[0];
        if (Array.isArray(src) && Array.isArray(src[0])) return src[(args[1] ?? 1) - 1]?.[(args[2] ?? 1) - 1] ?? "#N/A";
        const rows = toRows(src);
        if (rows) return rows[(args[1] ?? 1) - 1]?.[(args[2] ?? 1) - 1] ?? "#N/A";
        return Array.isArray(src) ? (src[(args[1] ?? 1) - 1] ?? "#N/A") : "#N/A";
      }
      if (fname === "MATCH") {
        const lookup = args[0], arr = args[1];
        for (let i = 0; i < arr.length; i++) if (arr[i] === lookup) return i + 1;
        return "#N/A";
      }
      if (fname === "TABLE") {
        return tables?.[args[0]] ?? null;
      }
      if (fname === "COL") {
        const tbl = tables?.[args[0]];
        if (!tbl) return null;
        const idx = tbl.headers.indexOf(args[1]);
        return idx >= 0 ? tbl.rows.map(r => r[idx]) : null;
      }
      if (window.formulajs && window.formulajs[fname]) {
        return window.formulajs[fname](...args);
      }
      throw new Error(`Unknown function: ${fname}`);
    } catch (e) {
      return `#ERROR: ${e.message}`;
    }
  };

  return {
    eval: (formula, colMap, tables = {}) => {
      try {
        if (!formula || !formula.trim()) return "";
        if (!formula.startsWith("=")) return formula;
        const expr = formula.substring(1);
        const tokens = tokenize(expr);
        const ast = parse(tokens, colMap);
        return evaluate(ast, colMap, tables);
      } catch (e) {
        return `#ERROR: ${e.message}`;
      }
    },
    functions: () => ({
      Logic: ["IF", "IFS", "AND", "OR", "NOT", "IFERROR"],
      Math: ["SUM", "AVERAGE", "MIN", "MAX", "ROUND", "ABS", "INT", "MOD", "POWER"],
      Text: ["CONCAT", "TEXTJOIN", "LEFT", "RIGHT", "MID", "LEN", "TRIM", "UPPER", "LOWER", "PROPER", "SUBSTITUTE", "TEXT", "VALUE"],
      Date: ["TODAY", "NOW", "YEAR", "MONTH", "DAY", "QUARTER", "WEEKDAY", "WEEKNUM", "DATE", "EOMONTH"],
      Lookup: ["VLOOKUP", "HLOOKUP", "XLOOKUP", "LOOKUP", "INDEX", "MATCH", "CHOOSE", "TABLE", "COL"]
    })
  };
})();
