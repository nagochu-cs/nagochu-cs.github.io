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
  var photos = []; // 描き直した JPEG（data URL）

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

  // 活動名の選択肢
  var sel = form.activity;
  (C.ACTIVITIES || []).forEach(function (a) {
    var o = document.createElement('option');
    o.textContent = a.name;
    sel.appendChild(o);
  });

  // 今日の日付を入れておく
  var now = new Date();
  form.date.value = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);

  // 合言葉と名前は、この端末に覚えておく（次からは入力しなくてよい）
  function remember(k, v) { try { if (v) localStorage.setItem('a4b_' + k, v); } catch (e) { /* 使えない端末では覚えない */ } }
  function recall(k) { try { return localStorage.getItem('a4b_' + k) || ''; } catch (e) { return ''; } }
  form.passcode.value = recall('passcode');
  form.writer.value = recall('writer');

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
  form.photos.addEventListener('change', function () {
    var files = Array.prototype.slice.call(form.photos.files || []);
    photos = [];
    previews.innerHTML = '';
    if (files.length > MAX_PHOTOS) say('写真は4枚までです。はじめの4枚だけを使います。', true);
    else say('');
    files = files.slice(0, MAX_PHOTOS);
    if (!files.length) return;
    btn.disabled = true;
    var failed = 0;
    files.reduce(function (p, file) {
      return p.then(function () {
        return loadImage(file).then(function (img) {
          var data = toJpeg(img);
          photos.push(data);
          var im = document.createElement('img');
          im.src = data;
          im.alt = (photos.length) + '枚目';
          previews.appendChild(im);
        }, function () { failed++; });
      });
    }, Promise.resolve()).then(function () {
      btn.disabled = false;
      if (failed) say(failed + '枚の写真を読み込めませんでした。別の写真を選んでください（ほかの写真は送れます）。', true);
    });
  });

  // ─── 送信 ───
  function check() {
    if (!form.passcode.value.trim()) return '合言葉を入れてください。';
    if (!form.date.value) return ERRORS.bad_date;
    if (!form.activity.value) return ERRORS.bad_activity;
    if (!form.title.value.trim()) return 'タイトルを入れてください。';
    if (!form.body.value.trim()) return ERRORS.bad_body;
    if (!form.checkFace.checked || !form.checkName.checked) return ERRORS.bad_checks;
    if (!form.writer.value.trim()) return ERRORS.bad_writer;
    return '';
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var problem = check();
    if (problem) { say(problem, true); return; }
    if (!C.GAS_URL) { say(ERRORS.not_ready, true); return; }
    var payload = {
      passcode: form.passcode.value.trim(),
      date: form.date.value,
      activity: form.activity.value,
      title: form.title.value.trim(),
      body: form.body.value.trim(),
      captions: form.captions.value.trim(),
      checkFace: form.checkFace.checked,
      checkName: form.checkName.checked,
      writer: form.writer.value.trim(),
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
        remember('passcode', payload.passcode);
        remember('writer', payload.writer);
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
