// a4b.jp 共通の動き: GAS から公開済みの記事を読んで並べる
(function () {
  var C = window.A4B_CONFIG || {};

  // ─── GAS を読む（fetch がだめなら JSONP） ───
  var jsonpSeq = 0;
  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var name = '__a4b_cb' + (++jsonpSeq);
      var s = document.createElement('script');
      var timer = setTimeout(function () { done(); reject(new Error('timeout')); }, 15000);
      function done() { clearTimeout(timer); delete window[name]; s.remove(); }
      window[name] = function (data) { done(); resolve(data); };
      s.onerror = function () { done(); reject(new Error('jsonp error')); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + name;
      document.head.appendChild(s);
    });
  }
  var mode = null; // 'fetch' か 'jsonp'。一度決まったら使い回す
  function api(params) {
    if (!C.GAS_URL) return Promise.reject(new Error('no_url'));
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var url = C.GAS_URL + (q ? '?' + q : '');
    if (mode === 'jsonp') return jsonp(url);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (d) { mode = 'fetch'; return d; }, function () {
      mode = 'jsonp';
      return jsonp(url);
    });
  }

  var listPromise = null;
  function getArticles() {
    if (!listPromise) listPromise = api({}).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      return d.articles;
    });
    return listPromise;
  }

  // ─── 表示 ───
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function para(s) { return esc(s).replace(/\r?\n/g, '<br>'); }
  function jpDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
  }
  function excerpt(s, n) { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; }
  function slugOf(name) {
    var a = (C.ACTIVITIES || []).filter(function (x) { return x.name === name; })[0];
    return a ? a.slug : '';
  }

  // 写真は1枚ずつ GAS から受け取る（ドライブでは公開していない）
  var photoCache = {};
  function loadPhoto(img) {
    var id = img.getAttribute('data-photo');
    if (!photoCache[id]) photoCache[id] = api({ photo: id }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      return 'data:' + d.mime + ';base64,' + d.data;
    });
    photoCache[id].then(function (src) { img.src = src; img.classList.add('loaded'); },
      function () { img.closest('figure') && img.closest('figure').classList.add('photo-error'); });
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); loadPhoto(e.target); } });
  }, { rootMargin: '200px' }) : null;
  function watchPhotos(root) {
    root.querySelectorAll('img[data-photo]').forEach(function (img) { io ? io.observe(img) : loadPhoto(img); });
  }

  function card(a) {
    var ph = a.photos && a.photos[0];
    return '<article class="card">' +
      '<a href="kiji.html?id=' + encodeURIComponent(a.id) + '">' +
      '<div class="card-photo">' + (ph ? '<img data-photo="' + esc(ph.id) + '" alt="' + esc(ph.caption || a.title) + '">' : '<span class="no-photo">' + esc(a.activity) + '</span>') + '</div>' +
      '<div class="card-body">' +
      '<p class="meta"><span class="tag tag-' + slugOf(a.activity) + '">' + esc(a.activity) + '</span><time>' + jpDate(a.date) + '</time></p>' +
      '<h3>' + esc(a.title) + '</h3>' +
      '<p>' + esc(excerpt(a.body, 60)) + '</p>' +
      '</div></a></article>';
  }

  function showList(el, list, emptyText) {
    el.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">' + esc(emptyText || 'まだ記事がありません。') + '</p>';
    watchPhotos(el);
  }
  function showError(el, err) {
    el.innerHTML = '<p class="empty">' + (err && err.message === 'no_url'
      ? '記事の読み込みは準備中です。'
      : '記事を読み込めませんでした。時間をおいて、もう一度ひらいてください。') + '</p>';
  }

  // data-articles="latest:4" / "all" / "activity:朝ごはんPJ:3" のついた箱に記事を入れる
  function fillBoxes() {
    var boxes = document.querySelectorAll('[data-articles]');
    if (!boxes.length) return;
    boxes.forEach(function (el) { el.innerHTML = '<p class="empty">読み込み中…</p>'; });
    getArticles().then(function (list) {
      boxes.forEach(function (el) {
        var spec = el.getAttribute('data-articles').split(':');
        var items = list;
        if (spec[0] === 'activity') items = list.filter(function (a) { return a.activity === spec[1]; });
        var n = Number(spec[spec.length - 1]);
        if (n) items = items.slice(0, n);
        showList(el, items, el.getAttribute('data-empty'));
      });
    }, function (err) { boxes.forEach(function (el) { showError(el, err); }); });
  }

  // 記事一覧ページ: 活動名で絞り込む
  function setupFilter() {
    var bar = document.getElementById('filter');
    var box = document.getElementById('all-articles');
    if (!bar || !box) return;
    var current = new URLSearchParams(location.search).get('a') || '';
    var btns = [{ name: '', label: 'すべて' }].concat((C.ACTIVITIES || []).map(function (x) { return { name: x.name, label: x.name }; }));
    bar.innerHTML = btns.map(function (b) {
      return '<button type="button" data-a="' + esc(b.name) + '"' + (b.name === current ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(b.label) + '</button>';
    }).join('');
    box.innerHTML = '<p class="empty">読み込み中…</p>';
    getArticles().then(function (list) {
      function render() {
        var items = current ? list.filter(function (a) { return a.activity === current; }) : list;
        showList(box, items, current ? 'この活動の記事は、まだありません。' : '');
      }
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        current = b.getAttribute('data-a');
        bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        history.replaceState(null, '', current ? '?a=' + encodeURIComponent(current) : location.pathname);
        render();
      });
      render();
    }, function (err) { showError(box, err); });
  }

  // 記事ページ
  function setupArticle() {
    var box = document.getElementById('article');
    if (!box) return;
    var id = new URLSearchParams(location.search).get('id');
    box.innerHTML = '<p class="empty">読み込み中…</p>';
    getArticles().then(function (list) {
      var a = list.filter(function (x) { return x.id === id; })[0];
      if (!a) { box.innerHTML = '<p class="empty">この記事は見つかりませんでした。</p>'; return; }
      document.title = a.title + '｜名護中学校コミュニティスクール';
      box.innerHTML =
        '<p class="meta"><a class="tag tag-' + slugOf(a.activity) + '" href="katsudo.html?a=' + encodeURIComponent(a.activity) + '">' + esc(a.activity) + '</a><time>' + jpDate(a.date) + '</time></p>' +
        '<h1>' + esc(a.title) + '</h1>' +
        '<div class="article-body"><p>' + para(a.body) + '</p></div>' +
        (a.photos || []).map(function (p) {
          return '<figure><img data-photo="' + esc(p.id) + '" alt="' + esc(p.caption || '') + '">' + (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '') + '</figure>';
        }).join('');
      watchPhotos(box);
    }, function (err) { showError(box, err); });
  }

  // data-school="5" / "all" のついた箱に学校のホームページの CS 記事を、
  // data-insta="5" / "all" の箱に学生ボランティアの Instagram の投稿を、リンクで並べる（なければ節ごと隠す）
  function fillLinks(attr, param) {
    var boxes = document.querySelectorAll('[' + attr + ']');
    if (!boxes.length) return;
    var q = {}; q[param] = 1;
    api(q).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      boxes.forEach(function (el) {
        var n = el.getAttribute(attr);
        var items = n === 'all' ? d.items : d.items.slice(0, Number(n) || 5);
        var section = el.closest('section');
        if (!items.length) { if (section) section.hidden = true; return; }
        el.innerHTML = items.map(function (x) {
          return '<li><time>' + jpDate(x.date) + '</time><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a></li>';
        }).join('');
      });
    }).catch(function () {
      boxes.forEach(function (el) { var s = el.closest('section'); if (s) s.hidden = true; });
    });
  }

  function setupContact() {
    document.querySelectorAll('[data-contact-form]').forEach(function (a) {
      if (C.CONTACT_FORM_URL) { a.href = C.CONTACT_FORM_URL; } else { a.classList.add('disabled'); a.textContent = 'フォームは準備中です'; a.removeAttribute('href'); }
    });
  }

  function setupNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      if (a.getAttribute('href') === here || (here === 'kiji.html' && a.getAttribute('href') === 'katsudo.html')) a.setAttribute('aria-current', 'page');
    });
    var t = document.querySelector('.nav-toggle');
    if (t) t.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupNav(); setupContact(); fillBoxes(); setupFilter(); setupArticle(); fillLinks('data-school', 'school'); fillLinks('data-insta', 'insta');
  });
})();
