// 投稿ページ（toukou.html）の「記事を直す（管理）」: 全部の記事を並べ、公開・非公開を切りかえ、文字と写真を直す
// 管理用の合言葉（投稿の合言葉とは別）で GAS の doPost（action: admin_list / admin_set）を呼ぶ。合言葉は sessionStorage にだけ置く
(function () {
  var C = window.A4B_CONFIG || {};
  var KEY = 'a4b_admin';
  var ERRORS = {
    bad_passcode: '管理用の合言葉がちがいます。',
    too_many: '合言葉のまちがいが多いため、しばらく受け付けていません。1時間ほどあけてください。',
    not_ready: '管理用の合言葉がまだ決まっていません（GAS で setAdminPasscode を実行してください）。',
    not_found: 'その記事が見つかりません。一覧を読みこみ直してください。',
    bad_date: '日付を入れてください。',
    bad_activity: '活動名を選んでください。',
    bad_title: 'タイトルは40字までで入れてください。',
    bad_body: '本文を入れてください（2000字まで）。',
    bad_photo: '写真を読み込めませんでした。別の写真を選んでください。',
    too_many_photos: '写真は4枚までです。',
  };
  var MAX_PHOTOS = 4;
  var PHOTO_SIZE = 1600;
  var thumbs = {};     // 写真の見本（ID → data URL）
  var editing = null;  // 直している記事の ID
  var edit = null;     // 直している中身 { photos: [{ keep: ID } | { data: JPEG の data URL }], changed: 写真を変えたか }
  var STATUSES = ['未確認', '公開', '非公開'];
  var section = document.getElementById('naosu');
  var postForm = document.getElementById('post-form');
  var done = document.getElementById('post-done');
  var login = document.getElementById('admin-login');
  var msg = document.getElementById('a-message');
  var body = document.getElementById('admin-body');
  var listEl = document.getElementById('admin-list');
  var filterEl = document.getElementById('admin-filter');
  var items = [];
  var filter = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function say(text, isError) { msg.textContent = text || ''; msg.classList.toggle('error', !!isError); }
  function pass() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function keep(v) { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) { /* 覚えられない端末 */ } }
  function jpDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '（日付なし）';
  }

  // 「記事を書く」と「記事を直す」を、URL の #naosu で切りかえる
  function mode() {
    var naosu = location.hash === '#naosu';
    section.hidden = !naosu;
    postForm.hidden = naosu;
    if (naosu) done.hidden = true;
    document.getElementById('mode-title').textContent = naosu ? '記事を直す' : '記事を書く';
    document.getElementById('mode-lead').textContent = naosu
      ? '届いた記事を並べ、公開・非公開の切りかえと、文字・写真の直しをするページです（管理用）。'
      : '活動の記事を送るページです。送った記事は、確認してからサイトに載せます。すぐには公開されません。';
    document.getElementById('tab-kaku').toggleAttribute('aria-current', !naosu);
    document.getElementById('tab-naosu').toggleAttribute('aria-current', naosu);
    if (naosu && pass() && !items.length) load();
  }
  window.addEventListener('hashchange', mode);
  document.getElementById('tab-kaku').addEventListener('click', function (ev) {
    if (location.hash === '#naosu') { ev.preventDefault(); history.pushState(null, '', 'toukou.html'); mode(); }
  });

  function api(payload) {
    payload.passcode = pass();
    return fetch(C.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || 'server_error'); return d; });
  }
  function fail(err) {
    if (err.message === 'bad_passcode') { keep(''); body.hidden = true; login.hidden = false; }
    say(ERRORS[err.message] || 'うまくいきませんでした。電波のよいところで、もう一度ためしてください。', true);
  }

  function load() {
    if (!C.GAS_URL) { say(ERRORS.not_ready, true); return; }
    editing = null; edit = null;
    say('記事の一覧を読みこんでいます…');
    api({ action: 'admin_list' }).then(function (d) {
      items = d.items || [];
      login.hidden = true;
      body.hidden = false;
      say('');
      draw();
    }, fail);
  }

  login.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = login.passcode.value.trim();
    if (!v) { say('管理用の合言葉を入れてください。', true); return; }
    keep(v);
    login.passcode.value = '';
    load();
  });

  function draw() {
    var counts = { '': items.length };
    STATUSES.forEach(function (s) { counts[s] = items.filter(function (x) { return x.status === s; }).length; });
    filterEl.innerHTML = [''].concat(STATUSES).map(function (s) {
      return '<button type="button" data-f="' + s + '" aria-pressed="' + (filter === s) + '">' + (s || 'すべて') + '（' + counts[s] + '）</button>';
    }).join('') + '<button type="button" class="reload" data-reload="1">読みこみ直す</button>';
    var shown = items.filter(function (x) { return !filter || x.status === filter; });
    listEl.innerHTML = shown.length ? shown.map(function (x) {
      var btns = STATUSES.filter(function (s) { return s !== x.status; }).map(function (s) {
        return '<button type="button" class="button' + (s === '公開' ? '' : ' button-ghost') + '" data-id="' + esc(x.id) + '" data-s="' + s + '">' + s + 'にする</button>';
      }).join('');
      return '<li class="admin-item s-' + esc(x.status) + '">' +
        '<p class="meta"><span class="badge">' + esc(x.status) + '</span>' + esc(jpDate(x.date)) + '　' + esc(x.activity) + '</p>' +
        '<h3>' + esc(x.title || '（タイトルなし）') + '</h3>' +
        '<details><summary>本文を見る</summary><p class="body">' + esc(x.body).replace(/\r?\n/g, '<br>') + '</p></details>' +
        '<p class="sub">書いた人: ' + esc(x.writer) + '　写真: ' + x.photos.length + '枚' + (x.memo ? '　メモ: ' + esc(x.memo) : '') + '</p>' +
        '<div class="acts">' + btns + '<button type="button" class="button button-ghost" data-edit="' + esc(x.id) + '">' + (editing === x.id ? '直すのをやめる' : '文字・写真を直す') + '</button>' +
        (x.status === '公開' ? '<a href="kiji.html?id=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">サイトで見る</a>' : '') + '</div>' +
        (editing === x.id ? editor(x) : '') +
        '</li>';
    }).join('') : '<li class="empty">この中には記事がありません。</li>';
  }

  // ─── 文字と写真を直す ───
  function editor(x) {
    var acts = (C.ACTIVITIES || []).map(function (a) { return a.name; });
    if (x.activity && acts.indexOf(x.activity) === -1) acts.push(x.activity);
    var opts = acts.map(function (a) { return '<option' + (a === x.activity ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('');
    var ph = edit.photos.map(function (p, i) {
      var src = p.data || thumbs[p.keep] || '';
      return '<li><figure>' + (src ? '<img src="' + src + '" alt="' + (i + 1) + '枚目">' : '<span class="loading">読みこみ中…</span>') +
        '<figcaption>' + (i + 1) + '枚目' + (p.data ? '（新しい写真）' : '') + '</figcaption></figure>' +
        '<button type="button" class="button button-ghost" data-ph-remove="' + i + '">外す</button>' +
        '<label class="button button-ghost">入れ替える<input type="file" accept="image/*" data-ph-replace="' + i + '" hidden></label></li>';
    }).join('');
    return '<form class="post-form admin-edit" data-form="' + esc(x.id) + '" novalidate>' +
      '<label>活動した日</label><input name="date" type="date" value="' + esc(x.date) + '">' +
      '<label>活動名</label><select name="activity">' + opts + '</select>' +
      '<label>タイトル</label><input name="title" type="text" maxlength="40" value="' + esc(x.title) + '">' +
      '<label>本文</label><textarea name="body" rows="10" maxlength="2000">' + esc(x.body) + '</textarea>' +
      '<p class="hint">生徒の名前は書かないでください。</p>' +
      '<label>写真の説明</label><textarea name="captions" rows="3">' + esc(x.captions) + '</textarea>' +
      '<p class="hint">1行に1枚ずつ、写真の順に。</p>' +
      '<p class="label-like">写真（4枚まで）</p>' +
      '<ul class="admin-photos">' + ph + '</ul>' +
      (edit.photos.length < MAX_PHOTOS ? '<label class="button button-ghost add-photo">写真を足す<input type="file" accept="image/*" multiple data-ph-add="1" hidden></label>' : '') +
      '<p class="hint">なるべく顔が映っていないもの（後ろ姿・手元・遠くから）。位置情報は自動で消します。</p>' +
      '<div class="acts"><button type="submit" class="button">保存する</button><button type="button" class="button button-ghost" data-edit="' + esc(x.id) + '">やめる</button></div>' +
      '</form>';
  }

  function openEditor(id) {
    if (editing === id) { editing = null; edit = null; draw(); return; }
    var x = items.filter(function (i) { return i.id === id; })[0];
    if (!x) return;
    editing = id;
    edit = { photos: x.photos.map(function (pid) { return { keep: pid }; }), changed: false };
    draw();
    x.photos.forEach(function (pid) {
      if (thumbs[pid]) return;
      api({ action: 'admin_photo', photo: pid }).then(function (d) {
        thumbs[pid] = 'data:' + d.mime + ';base64,' + d.data;
        if (editing === id) redrawEditor();
      }, function () { /* 見本が出なくても直せる */ });
    });
  }

  // 書きかけの文字を残したまま、写真の欄だけ描き直す
  function redrawEditor() {
    var f = listEl.querySelector('form[data-form]');
    var keep = f ? { date: f.date.value, activity: f.activity.value, title: f.title.value, body: f.body.value, captions: f.captions.value } : null;
    draw();
    f = listEl.querySelector('form[data-form]');
    if (f && keep) Object.keys(keep).forEach(function (k) { f[k].value = keep[k]; });
    if (f) f.closest('.admin-item').scrollIntoView({ block: 'nearest' });
  }

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
  function readPhotos(files) {
    var out = [];
    return files.reduce(function (p, file) {
      return p.then(function () { return loadImage(file).then(function (img) { out.push(toJpeg(img)); }, function () { /* 読めない写真はとばす */ }); });
    }, Promise.resolve()).then(function () { return out; });
  }

  listEl.addEventListener('change', function (ev) {
    var input = ev.target;
    if (!edit || input.type !== 'file') return;
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return;
    if (input.dataset.phReplace != null) files = files.slice(0, 1);
    readPhotos(files).then(function (list) {
      if (!list.length) { say(ERRORS.bad_photo, true); return; }
      if (input.dataset.phReplace != null) {
        edit.photos[Number(input.dataset.phReplace)] = { data: list[0] };
      } else {
        var room = MAX_PHOTOS - edit.photos.length;
        if (list.length > room) say('写真は4枚までです。はじめの' + room + '枚だけを足します。', true);
        list.slice(0, room).forEach(function (d) { edit.photos.push({ data: d }); });
      }
      edit.changed = true;
      redrawEditor();
    });
  });

  listEl.addEventListener('submit', function (ev) {
    var f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    var id = f.dataset.form;
    var x = items.filter(function (i) { return i.id === id; })[0];
    var text = { action: 'admin_update', id: id, date: f.date.value, activity: f.activity.value, title: f.title.value.trim(), body: f.body.value.trim(), captions: f.captions.value.trim() };
    if (!text.title) { say(ERRORS.bad_title, true); return; }
    if (!text.body) { say(ERRORS.bad_body, true); return; }
    var photos = edit.changed ? edit.photos.map(function (p) { return p.keep ? { keep: p.keep } : { data: p.data.replace(/^data:image\/jpeg;base64,/, '') }; }) : null;
    listEl.querySelectorAll('button, input, select, textarea').forEach(function (e) { e.disabled = true; });
    say('保存しています…' + (photos && x && x.status === '公開' ? '（写真の準備に30秒ほどかかることがあります）' : ''));
    api(text).then(function () {
      return photos ? api({ action: 'admin_photos', id: id, photos: photos }) : null;
    }).then(function (d) {
      if (x) {
        x.date = text.date; x.activity = text.activity; x.title = text.title; x.body = text.body; x.captions = text.captions;
        if (d) {
          d.photos.forEach(function (pid, i) { var p = edit.photos[i]; if (p && p.data) thumbs[pid] = p.data; });
          x.photos = d.photos; x.memo = d.memo;
        }
      }
      editing = null; edit = null;
      say('「' + text.title + '」を保存しました。' + (x && x.status === '公開' ? 'サイトにもすぐ出ます。' : ''));
      draw();
    }, function (err) { redrawEditor(); fail(err); });
  });

  filterEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.reload) { load(); return; }
    filter = b.dataset.f;
    draw();
  });

  listEl.addEventListener('click', function (ev) {
    var e = ev.target.closest('button[data-edit]');
    if (e) { openEditor(e.dataset.edit); return; }
    var rm = ev.target.closest('button[data-ph-remove]');
    if (rm && edit) { edit.photos.splice(Number(rm.dataset.phRemove), 1); edit.changed = true; redrawEditor(); return; }
    var b = ev.target.closest('button[data-id]');
    if (!b) return;
    var x = items.filter(function (i) { return i.id === b.dataset.id; })[0];
    var to = b.dataset.s;
    listEl.querySelectorAll('button').forEach(function (e) { e.disabled = true; });
    say('「' + to + '」にしています…' + (to === '公開' ? '（写真の準備に30秒ほどかかることがあります）' : ''));
    api({ action: 'admin_set', id: b.dataset.id, status: to }).then(function (d) {
      if (x) { x.status = d.status; x.memo = d.memo; }
      say('「' + (x ? x.title : '') + '」を「' + d.status + '」にしました。');
      draw();
    }, function (err) { draw(); fail(err); });
  });

  mode();
})();
