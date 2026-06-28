/* ═══════════════════════════════════════════════════════════
   Black Hole Video Background + Ambient Space Audio
   Shared across all Surrey AI Automation pages
   ═══════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  /* ── VIDEO BACKGROUND ── */
  var existing = document.getElementById('bhVideo');
  if (!existing) {
    var base = document.getElementById('bgBase');
    if (!base) {
      base = document.createElement('div');
      base.id = 'bgBase';
      base.style.cssText = 'position:fixed;inset:0;background:#060C18;z-index:-2;pointer-events:none;';
      document.body.insertBefore(base, document.body.firstChild);
    }
    var vid = document.createElement('video');
    vid.id = 'bhVideo';
    vid.autoplay = true;
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.setAttribute('playsinline','');
    vid.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;object-fit:cover;pointer-events:none;opacity:0;transition:opacity 1.5s ease-in;filter:brightness(0.32) contrast(1.15);';
    vid.src = 'bh_god_pullin.mp4';
    vid.addEventListener('canplay', function(){ vid.style.opacity = '0.38'; }, {once:true});
    if (base.nextSibling) {
      base.parentNode.insertBefore(vid, base.nextSibling);
    } else {
      document.body.insertBefore(vid, document.body.firstChild);
    }
  } else {
    existing.addEventListener('canplay', function(){ existing.style.opacity = '0.38'; }, {once:true});
  }

  /* ── AUDIO TOGGLE CSS ── */
  var style = document.createElement('style');
  style.textContent = [
    '.sa-audio-toggle{position:fixed;bottom:28px;right:28px;z-index:99998;display:flex;align-items:center;gap:10px;background:rgba(6,12,24,.92);border:1px solid rgba(255,170,68,.3);backdrop-filter:blur(12px);border-radius:999px;padding:8px 18px 8px 12px;cursor:pointer!important;transition:border-color .3s,box-shadow .3s;box-shadow:0 0 18px rgba(255,170,68,.12);user-select:none;-webkit-user-select:none;}',
    '.sa-audio-toggle:hover{border-color:rgba(255,170,68,.55);box-shadow:0 0 24px rgba(255,170,68,.22);}',
    '.sa-audio-icon{font-size:1.1rem;line-height:1;}',
    '.sa-audio-track{width:38px;height:20px;border-radius:10px;background:rgba(255,255,255,.15);position:relative;transition:background .2s;}',
    '.sa-audio-track.active{background:rgba(255,170,68,.5);}',
    '.sa-audio-knob{width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3);}',
    '.sa-audio-track.active .sa-audio-knob{left:20px;}',
    '.sa-audio-label{font-size:.78rem;color:rgba(255,255,255,.7);font-weight:600;letter-spacing:.02em;}',
    '@media(max-width:600px){.sa-audio-toggle{bottom:80px;right:16px;padding:6px 14px 6px 10px;}.sa-audio-label{display:none;}}'
  ].join('\n');
  document.head.appendChild(style);

  /* ── AMBIENT AUDIO — original generated cosmic track, looped ── */
  var bgAudio = null, audioOn = false, fadeTimer = null;
  var TARGET_VOL = 0.6;

  function createAmbient(){
    bgAudio = new Audio('cosmic-ambient.mp3');
    bgAudio.loop = true;        // seamless continuous playback while toggle is ON
    bgAudio.preload = 'auto';
    bgAudio.volume = 0;
  }

  function clearFade(){ if (fadeTimer){ clearInterval(fadeTimer); fadeTimer = null; } }

  function fadeTo(target, dur, done){
    if (!bgAudio) return;
    clearFade();
    var start = bgAudio.volume;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    fadeTimer = setInterval(function(){
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      var p = Math.min(1, (now - t0) / dur);
      bgAudio.volume = Math.max(0, Math.min(1, start + (target - start) * p));
      if (p >= 1){ clearFade(); if (done) done(); }
    }, 40);
  }

  function fadeIn(){
    if (!bgAudio) createAmbient();
    var pr = bgAudio.play();
    if (pr && pr.catch) pr.catch(function(){});  // ignore autoplay rejection; resumes on user gesture
    fadeTo(TARGET_VOL, 2500);
    audioOn = true;
  }

  function fadeOut(){
    if (!bgAudio) return;
    fadeTo(0, 1800, function(){ try { bgAudio.pause(); } catch(e){} });
    audioOn = false;
  }

  /* ── BUILD TOGGLE BUTTON ── */
  var oldToggle = document.querySelector('.audio-toggle');
  if (oldToggle) oldToggle.remove();

  var btn = document.createElement('div');
  btn.className = 'sa-audio-toggle';
  var saved = localStorage.getItem('cosmicAudio');
  var startActive = saved === 'on';
  btn.innerHTML = '<span class="sa-audio-icon">'+(startActive?'🔊':'🔇')+'</span><div class="sa-audio-track'+(startActive?' active':'')+'"><div class="sa-audio-knob"></div></div><span class="sa-audio-label">'+(startActive?'Universe':'Sound off')+'</span>';
  btn.onclick = function(e){
    e.stopPropagation();
    var track = btn.querySelector('.sa-audio-track');
    var lbl = btn.querySelector('.sa-audio-label');
    var icon = btn.querySelector('.sa-audio-icon');
    if (audioOn) {
      fadeOut(); track.classList.remove('active');
      lbl.textContent = 'Sound off'; icon.textContent = '🔇';
      localStorage.setItem('cosmicAudio','off');
    } else {
      fadeIn(); track.classList.add('active');
      lbl.textContent = 'Universe'; icon.textContent = '🔊';
      localStorage.setItem('cosmicAudio','on');
    }
  };
  document.body.appendChild(btn);

  // Auto-resume if user had audio on (needs click interaction for browser policy)
  if (startActive) {
    document.addEventListener('click', function autoStart(e){
      if (e.target.closest && e.target.closest('.sa-audio-toggle')) return;
      fadeIn();
      document.removeEventListener('click', autoStart);
    }, {once: true});
  }
})();
