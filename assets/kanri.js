// 投稿ページ（toukou.html）の管理: 「記事を直す」（#naosu。公開の切りかえ・文字と写真の直し）と「リンクの管理」（#link。学校HP・Instagram）
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
    bad_url: 'URL を確かめてください（Instagram は投稿の URL、学校は学校のホームページの記事の URL）。',
    duplicate: 'その URL は、もう入っています。',
    bad_kind: '種類を選んでください。',
    too_long: '時間は30字まで、場所は60字までで入れてください。',
  };
  var linkBody = document.getElementById('link-body');
  var newsBody = document.getElementById('news-body');
  var news = [];
  var links = null;        // { school: [...], insta: [...] }
  var schoolFilter = '候補';
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

  // 「記事を書く」「記事を直す」「リンクの管理」を、URL の # で切りかえる
  var MODES = {
    kaku: { title: '記事を書く', lead: '活動の記事を送るページです。送った記事は、確認してからサイトに載せます。すぐには公開されません。' },
    naosu: { title: '記事を直す', lead: '届いた記事を並べ、公開・非公開の切りかえと、文字・写真の直しをするページです（管理用）。' },
    news: { title: 'お知らせの管理', lead: '今後の予定とお知らせを、サイトに載せる・外すページです（管理用）。' },
    link: { title: 'リンクの管理', lead: '学生ボランティアの Instagram と、学校のホームページの記事を、サイトに載せる・外すページです（管理用）。' },
  };
  function current() { return location.hash === '#naosu' ? 'naosu' : location.hash === '#link' ? 'link' : location.hash === '#news' ? 'news' : 'kaku'; }
  function mode() {
    var m = current();
    var admin = m !== 'kaku';
    section.hidden = !admin;
    postForm.hidden = admin;
    if (admin) done.hidden = true;
    document.getElementById('mode-title').textContent = MODES[m].title;
    document.getElementById('mode-lead').textContent = MODES[m].lead;
    ['kaku', 'naosu', 'link', 'news'].forEach(function (k) { document.getElementById('tab-' + k).toggleAttribute('aria-current', k === m); });
    body.hidden = true;
    linkBody.hidden = true;
    newsBody.hidden = true;
    say('');
    if (!admin) return;
    if (!pass()) { login.hidden = false; return; }
    if (m === 'naosu') load(); else if (m === 'news') loadNews(); else loadLinks();
  }
  window.addEventListener('hashchange', mode);
  document.getElementById('tab-kaku').addEventListener('click', function (ev) {
    if (current() !== 'kaku') { ev.preventDefault(); history.pushState(null, '', 'toukou.html'); mode(); }
  });

  function api(payload) {
    payload.passcode = pass();
    return fetch(C.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || 'server_error'); return d; });
  }
  function fail(err) {
    if (err.message === 'bad_passcode') { keep(''); body.hidden = true; linkBody.hidden = true; newsBody.hidden = true; login.hidden = false; }
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
    if (current() === 'link') loadLinks(); else if (current() === 'news') loadNews(); else load();
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

  // ─── リンクの管理（学校HP・Instagram） ───
  function loadLinks() {
    if (!C.GAS_URL) { say(ERRORS.not_ready, true); return; }
    say('リンクの一覧を読みこんでいます…');
    api({ action: 'admin_links' }).then(function (d) {
      links = { school: d.school || [], insta: d.insta || [] };
      login.hidden = true;
      linkBody.hidden = false;
      say('');
      drawLinks();
    }, fail);
  }

  function linkItem(kind, x) {
    var btns = ['掲載', '外す', '候補'].filter(function (s) { return s !== x.status && !(kind === 'insta' && s === '候補'); }).map(function (s) {
      return '<button type="button" class="button' + (s === '掲載' ? '' : ' button-ghost') + '" data-kind="' + kind + '" data-url="' + esc(x.url) + '" data-ls="' + s + '">' + s + (s === '外す' ? '' : 'に') + 'する</button>';
    }).join('');
    return '<li class="admin-item s-' + (x.status === '掲載' ? '公開' : x.status === '外す' ? '非公開' : '未確認') + '">' +
      '<p class="meta"><span class="badge">' + esc(x.status) + '</span>' + esc(jpDate(x.date)) + (x.words ? '　当てはまった語: ' + esc(x.words) : '') + '</p>' +
      '<h3><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title || '（見出しなし）') + '</a></h3>' +
      '<div class="acts">' + btns + '</div></li>';
  }

  function drawLinks() {
    var ins = document.getElementById('insta-list');
    ins.innerHTML = links.insta.length ? links.insta.map(function (x) { return linkItem('insta', x); }).join('') : '<li class="empty">まだありません。</li>';
    var counts = { '': links.school.length };
    ['候補', '掲載', '外す'].forEach(function (s) { counts[s] = links.school.filter(function (x) { return x.status === s; }).length; });
    document.getElementById('school-filter').innerHTML = ['候補', '掲載', '外す', ''].map(function (s) {
      return '<button type="button" data-sf="' + s + '" aria-pressed="' + (schoolFilter === s) + '">' + (s || 'すべて') + '（' + counts[s] + '）</button>';
    }).join('') + '<button type="button" class="reload" data-lreload="1">読みこみ直す</button>';
    var shown = links.school.filter(function (x) { return !schoolFilter || x.status === schoolFilter; });
    document.getElementById('school-list').innerHTML = shown.length ? shown.map(function (x) { return linkItem('school', x); }).join('') : '<li class="empty">この中には記事がありません。</li>';
  }

  linkBody.addEventListener('click', function (ev) {
    var f = ev.target.closest('button[data-sf]');
    if (f) { schoolFilter = f.dataset.sf; drawLinks(); return; }
    if (ev.target.closest('button[data-lreload]')) { loadLinks(); return; }
    var b = ev.target.closest('button[data-ls]');
    if (!b) return;
    var kind = b.dataset.kind, url = b.dataset.url, to = b.dataset.ls;
    linkBody.querySelectorAll('.admin-item button').forEach(function (e) { e.disabled = true; });
    say('「' + to + '」にしています…');
    api({ action: 'admin_link_set', kind: kind, url: url, status: to }).then(function () {
      links[kind].forEach(function (x) { if (x.url === url) x.status = to; });
      say('「' + to + '」にしました。' + (to === '掲載' ? 'サイトにもすぐ出ます。' : ''));
      drawLinks();
    }, function (err) { drawLinks(); fail(err); });
  });

  function addLink(form, action, kind) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var payload = { action: action, url: form.url.value.trim(), date: form.date.value, title: form.title.value.trim() };
      if (!payload.url) { say(ERRORS.bad_url, true); return; }
      if (!payload.date) { say(ERRORS.bad_date, true); return; }
      if (!payload.title) { say('見出し（タイトル）を入れてください。', true); return; }
      form.querySelector('button').disabled = true;
      say('足しています…');
      api(payload).then(function (d) {
        form.reset();
        form.querySelector('button').disabled = false;
        if (kind === 'school') schoolFilter = '掲載';
        loadLinks();
        setTimeout(function () { say('足して、サイトに載せました。'); }, 1500);
      }, function (err) { form.querySelector('button').disabled = false; fail(err); });
    });
  }
  addLink(document.getElementById('insta-add'), 'admin_insta_add', 'insta');
  addLink(document.getElementById('school-add'), 'admin_school_add', 'school');

  // ─── お知らせの管理（今後の予定・お知らせ） ───
  function loadNews() {
    if (!C.GAS_URL) { say(ERRORS.not_ready, true); return; }
    say('予定・お知らせの一覧を読みこんでいます…');
    api({ action: 'admin_news' }).then(function (d) {
      news = d.items || [];
      login.hidden = true;
      newsBody.hidden = false;
      say('');
      drawNews();
    }, fail);
  }
  function drawNews() {
    document.getElementById('news-list').innerHTML = news.length ? news.map(function (x) {
      var to = x.status === '掲載' ? '外す' : '掲載';
      return '<li class="admin-item s-' + (x.status === '掲載' ? '公開' : '非公開') + '">' +
        '<p class="meta"><span class="badge">' + esc(x.status) + '</span>' + esc(x.kind) + '　' + esc(jpDate(x.date)) + (x.time ? '　' + esc(x.time) : '') + (x.place ? '　' + esc(x.place) : '') + '</p>' +
        '<h3>' + esc(x.title) + '</h3>' + (x.body ? '<p>' + esc(x.body) + '</p>' : '') +
        '<div class="acts"><button type="button" class="button' + (to === '掲載' ? '' : ' button-ghost') + '" data-nid="' + esc(x.id) + '" data-ns="' + to + '">' + to + (to === '掲載' ? 'にする' : '') + '</button></div></li>';
    }).join('') : '<li class="empty">まだありません。上から足してください。</li>';
  }
  newsBody.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-nid]');
    if (!b) return;
    var id = b.dataset.nid, to = b.dataset.ns;
    newsBody.querySelectorAll('.admin-item button').forEach(function (e) { e.disabled = true; });
    say('「' + to + '」にしています…');
    api({ action: 'admin_news_set', id: id, status: to }).then(function () {
      news.forEach(function (x) { if (x.id === id) x.status = to; });
      say('「' + to + '」にしました。' + (to === '掲載' ? 'サイトにもすぐ出ます。' : ''));
      drawNews();
    }, function (err) { drawNews(); fail(err); });
  });
  (function () {
    var form = document.getElementById('news-add');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var payload = { action: 'admin_news_add' };
      ['kind', 'date', 'title', 'time', 'place', 'body', 'url'].forEach(function (k) { payload[k] = form[k].value.trim(); });
      if (!payload.date) { say(ERRORS.bad_date, true); return; }
      if (!payload.title) { say('見出しを入れてください。', true); return; }
      form.querySelector('button').disabled = true;
      say('足しています…');
      api(payload).then(function () {
        var kind = form.kind.value;
        form.reset();
        form.kind.value = kind;
        form.querySelector('button').disabled = false;
        loadNews();
        setTimeout(function () { say('足して、サイトに載せました。'); }, 1500);
      }, function (err) {
        form.querySelector('button').disabled = false;
        if (err.message === 'bad_title') say('見出しは60字までで入れてください。', true); else fail(err);
      });
    });
  })();

  mode();
})();
