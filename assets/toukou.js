// 投稿ページ（toukou.html）: ログインなしで記事を送る
// 写真はスマホの中で長い辺 1600px の JPEG に描き直してから送る（位置情報などは描き直すときに消える。iPhone の HEIC も JPEG になる）
(function () {
  var C = window.A4B_CONFIG || {};
  var MAX_PHOTOS = 4;
  var PHOTO_SIZE = 1600;
  var form = document.getElementById('post-form');
  var msg = document.getElementById('f-message');
  var btn = document.getElementById('f-submit');
  var previews = document.getElementById('f-previews');
  var photos = []; // 描き直した JPEG（data URL）。ファイルを選ぶ・貼り付け・ドラッグで足し、「外す」で外す

  var ERRORS = {
    bad_passcode: '合言葉がちがいます。',
    too_many: '送信が多すぎるため、しばらく受け付けていません。1時間ほどあけてください。',
    not_ready: 'まだ受付の準備ができていません。担当に知らせてください。',
    bad_date: '活動した日を入れてください。',
    bad_activity: '活動名を選んでください。',
    bad_title: 'タイトルは40字までで入れてください。',
    bad_body: '本文を入れてください（2000字まで）。',
    bad_writer: '書いた人を入れてください。',
    bad_checks: '写真の確認の2つにチェックを入れてください。',
    bad_photo: '写真を読み込めませんでした。別の写真を選んでください。',
    too_many_photos: '写真は4枚までです。',
  };

  // 活動名の選択肢。学校のようすのページ（gakkou-toukou.html。body に data-school）では、学校のようすの項目（2026-11-10）
  var SCHOOL = document.body.hasAttribute('data-school');
  var KEY = SCHOOL ? 'school_' : ''; // 覚えておく合言葉・名前は、CS の投稿ページの分と分ける
  if (SCHOOL) { ERRORS.bad_passcode = '合言葉がちがいます（教頭先生用の合言葉を入れてください）。'; ERRORS.bad_activity = '項目を選んでください。'; ERRORS.bad_date = '日付を入れてください。'; }
  var sel = form.activity;
  (SCHOOL ? C.SCHOOL_TOPICS || [] : C.ACTIVITIES || []).forEach(function (a) {
    var o = document.createElement('option');
    o.textContent = a.name;
    sel.appendChild(o);
  });

  // 合言葉は、全角の英数字・記号を半角に、全角の空白を半角にして前後の空白を取ってから送る（スマホの変換で弾かれないように、2026-10-18）
  function normPass(s) { return String(s || '').replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').trim(); }

  // 今日の日付を入れておく
  var now = new Date();
  form.date.value = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);

  // 名前は、この端末に覚えておく（次からは入力しなくてよい）。合言葉は「この端末で覚える」を選んだときだけ（2026-10-18）
  function remember(k, v) { try { if (v) localStorage.setItem('a4b_' + KEY + k, v); } catch (e) { /* 使えない端末では覚えない */ } }
  function forget(k) { try { localStorage.removeItem('a4b_' + KEY + k); } catch (e) { /* 使えない端末では何もしない */ } }
  function recall(k) { try { return localStorage.getItem('a4b_' + KEY + k) || ''; } catch (e) { return ''; } }
  form.passcode.value = recall('passcode');
  form.rememberPass.checked = !!form.passcode.value;
  // 学校のようすのページには「書いた人」の欄がない（2026-11-10 社長の指示）。シートには「教頭先生」と入れる
  if (form.writer) form.writer.value = recall('writer');
  // 合言葉の「表示／隠す」（投稿と管理の両方の欄。変換を確かめられるように、2026-10-18）
  document.querySelectorAll('.pass-eye').forEach(function (b) {
    b.addEventListener('click', function () {
      var input = document.getElementById(b.getAttribute('aria-controls'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.textContent = show ? '隠す' : '表示';
      b.setAttribute('aria-pressed', String(show));
      input.focus();
    });
  });

  // 本文の字数
  var count = document.getElementById('f-count');
  function showCount() { count.textContent = '（いま ' + form.body.value.length + '字）'; }
  form.body.addEventListener('input', showCount);
  showCount();

  function say(text, isError) {
    msg.textContent = text;
    msg.className = 'post-message' + (isError ? ' error' : '');
  }

  // ─── 写真 ───
  // 本文のカーソルの位置に「【写真1】」の行を入れる。記事ではその場所に写真が出る（2026-11-03）
  function insertMark(ta, n) {
    var v = ta.value, at = ta.selectionStart == null ? v.length : ta.selectionStart;
    var before = v.slice(0, at), after = v.slice(at);
    var mark = (before && !/\n$/.test(before) ? '\n' : '') + '【写真' + n + '】' + (/^\n/.test(after) ? '' : '\n');
    ta.value = before + mark + after;
    var pos = before.length + mark.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
  }
  window.CS_insertPhotoMark = insertMark;
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  function toJpeg(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, PHOTO_SIZE / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
  // 写真の欄を描き直す（見本・「本文に入れる」・「外す」）
  function drawPhotos() {
    previews.innerHTML = '';
    photos.forEach(function (data, i) {
      var n = i + 1;
      var box = document.createElement('div');
      box.className = 'post-preview';
      var im = document.createElement('img');
      im.src = data;
      im.alt = n + '枚目';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'button button-ghost';
      b.textContent = n + '枚目を本文に入れる';
      b.addEventListener('click', function () { insertMark(form.body, n); showCount(); });
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'button button-ghost';
      rm.textContent = '外す';
      rm.addEventListener('click', function () { photos.splice(i, 1); form.body.value = dropMark(form.body.value, n); showCount(); drawPhotos(); say(''); });
      box.appendChild(im);
      box.appendChild(b);
      box.appendChild(rm);
      previews.appendChild(box);
    });
    if (drop) drop.hidden = photos.length >= MAX_PHOTOS;
  }
  // n 枚目を外したとき、本文の【写真n】の行を消し、うしろの番号を1つずつ詰める（印と写真がずれないように）
  function dropMark(text, n) {
    return text.replace(/\n?【写真(\d+)】\n?/g, function (all, k) {
      k = Number(k);
      if (k === n) return all.charAt(0) === '\n' && all.slice(-1) === '\n' ? '\n' : '';
      return all.replace(/\d+/, String(k > n ? k - 1 : k));
    });
  }
  window.CS_dropPhotoMark = dropMark;
  // 写真を足す（ファイルを選ぶ・貼り付け・ドラッグのどれも、ここを通る。4枚まで・長い辺 1600px の JPEG に描き直す）
  function addPhotos(files) {
    files = files.filter(function (f) { return /^image\//.test(f.type) || !f.type; });
    if (!files.length) return Promise.resolve();
    var room = MAX_PHOTOS - photos.length;
    if (room <= 0) { say('写真は4枚までです。足すときは、どれかを「外す」で外してください。', true); return Promise.resolve(); }
    if (files.length > room) say('写真は4枚までです。はじめの' + room + '枚だけを足します。', true);
    else say('');
    files = files.slice(0, room);
    btn.disabled = true;
    var failed = 0;
    return files.reduce(function (p, file) {
      return p.then(function () {
        return loadImage(file).then(function (img) { photos.push(toJpeg(img)); }, function () { failed++; });
      });
    }, Promise.resolve()).then(function () {
      btn.disabled = false;
      drawPhotos();
      if (failed) say(failed + '枚の写真を読み込めませんでした。別の写真を選んでください（ほかの写真は送れます）。', true);
    });
  }
  window.CS_addPostPhotos = addPhotos;
  form.photos.addEventListener('change', function () {
    var files = Array.prototype.slice.call(form.photos.files || []);
    form.photos.value = ''; // 同じ写真をもう一度選んでも足せるように
    addPhotos(files);
  });

  // クリップボード・ドラッグから画像のファイルを取り出す（Googleフォトの「画像をコピー」は PNG で入ることが多い。JPEG に描き直すので位置情報は残らない、2026-11-25）
  function imageFiles(dt) {
    if (!dt) return [];
    var out = [];
    Array.prototype.forEach.call(dt.items || [], function (it) {
      if (it.kind === 'file' && /^image\//.test(it.type)) { var f = it.getAsFile(); if (f) out.push(f); }
    });
    if (!out.length) Array.prototype.forEach.call(dt.files || [], function (f) { if (/^image\//.test(f.type)) out.push(f); });
    return out;
  }
  window.CS_imageFiles = imageFiles;
  function hasText(dt) { return !!(dt && dt.getData && dt.getData('text/plain')); }

  // 貼り付け（Ctrl+V）: 投稿のフォームの中か、どこにもカーソルがないときに受ける。管理の「文字・写真を直す」の中は kanri.js が受ける
  var drop = document.getElementById('f-drop');
  document.addEventListener('paste', function (ev) {
    if (form.hidden) return;
    var t = ev.target;
    var inForm = t && t.closest && t.closest('#post-form');
    if (!inForm && t !== document.body && t !== document.documentElement) return;
    var files = imageFiles(ev.clipboardData);
    if (!files.length) return;
    // 本文などの文字の欄に文字を貼るときは、ふつうに文字を貼る（画像だけのときに写真として受ける）
    if (/^(TEXTAREA|INPUT)$/.test(t.tagName) && t.type !== 'file' && hasText(ev.clipboardData)) return;
    ev.preventDefault();
    addPhotos(files);
  });
  if (drop) {
    drop.addEventListener('dragover', function (ev) { ev.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (ev) { ev.preventDefault(); drop.classList.remove('over'); addPhotos(imageFiles(ev.dataTransfer)); });
    drop.addEventListener('click', function () { drop.focus(); });
  }

  // ─── 送信 ───
  function check() {
    if (!normPass(form.passcode.value)) return '合言葉を入れてください。';
    if (!form.date.value) return ERRORS.bad_date;
    if (!form.activity.value) return ERRORS.bad_activity;
    if (!form.title.value.trim()) return 'タイトルを入れてください。';
    if (!form.body.value.trim()) return ERRORS.bad_body;
    if (!form.checkFace.checked || !form.checkName.checked) return ERRORS.bad_checks;
    if (form.writer && !form.writer.value.trim()) return ERRORS.bad_writer;
    return '';
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var problem = check();
    if (problem) { say(problem, true); return; }
    if (!C.GAS_URL) { say(ERRORS.not_ready, true); return; }
    var payload = {
      passcode: normPass(form.passcode.value),
      date: form.date.value,
      activity: form.activity.value,
      title: form.title.value.trim(),
      body: form.body.value.trim(),
      captions: form.captions.value.trim(),
      checkFace: form.checkFace.checked,
      checkName: form.checkName.checked,
      writer: form.writer ? form.writer.value.trim() : '教頭先生',
      website: form.website.value,
      photos: photos.map(function (d) { return d.replace(/^data:image\/jpeg;base64,/, ''); }),
    };
    btn.disabled = true;
    say('送信しています…（写真があると30秒ほどかかることがあります）');
    // text/plain で送る（GAS は CORS の事前確認に答えられないため）
    fetch(C.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'server_error');
        if (form.rememberPass.checked) remember('passcode', payload.passcode); else forget('passcode');
        if (form.writer) remember('writer', payload.writer);
        form.hidden = true;
        document.getElementById('post-done').hidden = false;
        window.scrollTo(0, 0);
      })
      .catch(function (err) {
        btn.disabled = false;
        say(ERRORS[err.message] || '送信できませんでした。電波のよいところで、もう一度「送信する」を押してください。', true);
      });
  });
})();
