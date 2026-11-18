# 公開した記事の写真を、サイトの assets/kiji/ に置く（2026-10-18 社長決定: 案A）
#
# 写真を GAS から1枚ずつ受け取ると1枚1.5〜2.5秒かかるので、公開した記事の写真は
# Pages に置いて、すぐ出るようにする。置いていない写真は、これまでどおり GAS から受け取る。
#
# 使い方（社長が記事を「公開」にしたあと、Claude が動かす）:
#   python 名護中CS/サイト試作/tools/kiji-photos.py          … 公開中の記事の写真で、まだないものを置く
#   python 名護中CS/サイト試作/tools/kiji-photos.py --prune  … 公開をやめた記事の写真を消す（社長のOKのあと）
# 2026-11-04 から、公開用リポジトリの GitHub Actions が1時間ごとにこれを動かし、新しい写真を自動で足す（社長決定）。
# 自動では消さない（--prune は使わない）。
# そのあと pages-publish.sh で公開用へ写す（push は社長のOKのあと）。
#
# GAS は読むだけ（記事の一覧と ?photo=）。写真は幅1000px まで小さくして JPEG で置く。
# あわせてスマホ用・カード用に幅640px の <ID>-s.jpg も作る（2026-11-03）。
# 写真の文字（説明）や記事を直したときは、写真の差しかえだけ置き直しが要る（同じ ID なら消してから動かす）。
#
# --pages をつけると、公開中の記事1本ごとに k/<記事ID>.html も作る（2026-11-18 社長の依頼）。
#   LINE などは送られた URL のページの OGP（題名・説明・画像）だけを読み、JavaScript は動かさない。
#   kiji.html?id= は全記事で同じ OGP なので、記事ごとのページに題名・書き出し・1枚目の写真を書いておく。
#   ひな形はサイトの kiji.html（中身は同じで、OGP と記事の ID だけ書きかえる）。一覧は k/list.js。
#   公開をやめた記事のページは外す（題名と写真が LINE の見え方に残らないように）。
#   公開用リポジトリの GitHub Actions が --site=. --pages で動かす。正本（site/）では作らない。
import base64, io, json, os, re, sys, urllib.parse, urllib.request
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
# 置き場のあるサイトのフォルダ。--site=フォルダ で変えられる（公開用リポジトリの GitHub Actions から動かすため。2026-11-04）
SITE = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--site=')), os.path.join(HERE, '..', 'site'))
DIR = os.path.join(SITE, 'assets', 'kiji')
LIST_JS = os.path.join(DIR, 'photos.js')
MAX_W, QUALITY = 1000, 75
SMALL_W = 640  # スマホ用・記事一覧のカード用（<ID>-s.jpg。2026-11-03 社長の指示）


def make_small(pid):
    """置き場の写真から、スマホ用の小さい版を作る（なければ）"""
    big, small = os.path.join(DIR, pid + '.jpg'), os.path.join(DIR, pid + '-s.jpg')
    if os.path.exists(small) or not os.path.exists(big):
        return False
    im = Image.open(big).convert('RGB')
    if im.width > SMALL_W:
        im = im.resize((SMALL_W, round(im.height * SMALL_W / im.width)), Image.LANCZOS)
    im.save(small, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print('スマホ用を作りました: %s（%dx%d、%dKB）' % (pid, im.width, im.height, os.path.getsize(small) // 1024))
    return True


def gas_url():
    s = open(os.path.join(SITE, 'assets', 'config.js'), encoding='utf-8').read()
    return re.search(r"GAS_URL:\s*'([^']+)'", s).group(1)


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


BASE = 'https://nagochu-cs.github.io/'
SITE_NAME = '名護中学校コミュニティスクール'
ID_RE = re.compile(r'[A-Za-z0-9_-]+')
PHOTO_LINE = re.compile(r'^\s*[【\[［]\s*写真\s*[0-9０-９]{1,2}\s*[】\]］]\s*$')


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def summary(body, n=90):
    """本文の書き出し（写真の印の行を外し、1行にして n 字まで）"""
    t = ' '.join(l for l in (body or '').splitlines() if not PHOTO_LINE.match(l))
    t = re.sub(r'\s+', ' ', t).strip()
    return t if len(t) <= n else t[:n] + '…'


def set_meta(html, attr, key, value):
    pat = re.compile(r'(<meta %s="%s" content=")[^"]*(">)' % (attr, re.escape(key)))
    html, n = pat.subn(lambda m: m.group(1) + value + m.group(2), html, count=1)
    if not n:
        raise ValueError(key)
    return html


def page_html(tpl, a):
    aid = a['id']
    title, desc = esc(a.get('title') or '記事'), esc(summary(a.get('body')))
    url = BASE + 'k/' + aid + '.html'
    if '<meta charset="utf-8">' not in tpl or '<link rel="stylesheet"' not in tpl:
        raise ValueError('charset か stylesheet')
    # k/ の中に置くので、ページの中の相対パス（assets/… や index.html）はサイトの一番上から読む
    h = tpl.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="../">', 1)
    h, n = re.subn(r'<title>[^<]*</title>', lambda m: '<title>' + title + '｜' + SITE_NAME + '</title>', h, count=1)
    if not n:
        raise ValueError('title')
    h = set_meta(h, 'name', 'description', desc)
    h = set_meta(h, 'property', 'og:title', title)
    h = set_meta(h, 'property', 'og:description', desc)
    h = set_meta(h, 'property', 'og:url', url)
    ph = next((p['id'] for p in (a.get('photos') or [])
               if ID_RE.fullmatch(p.get('id') or '') and os.path.exists(os.path.join(DIR, p['id'] + '.jpg'))), None)
    if ph:  # 置き場にある1枚目の写真。ないとき（写真なしの記事）はサイト共通の画像のまま
        w, hh = Image.open(os.path.join(DIR, ph + '.jpg')).size
        h = set_meta(h, 'property', 'og:image', BASE + 'assets/kiji/' + ph + '.jpg')
        h = set_meta(h, 'property', 'og:image:width', str(w))
        h = set_meta(h, 'property', 'og:image:height', str(hh))
    return h.replace('<link rel="stylesheet"', '<link rel="canonical" href="%s">\n<script>window.A4B_ARTICLE_ID = %s;</script>\n<link rel="stylesheet"'
                     % (url, json.dumps(aid)), 1)


def make_pages(articles):
    tpl_path = os.path.join(SITE, 'kiji.html')
    if not os.path.exists(tpl_path):
        print('kiji.html がないので、記事ごとのページは作りません')
        return
    tpl = open(tpl_path, encoding='utf-8').read()
    out = os.path.join(SITE, 'k')
    os.makedirs(out, exist_ok=True)
    made, changed = [], 0
    for a in articles:
        aid = a.get('id') or ''
        if not ID_RE.fullmatch(aid):
            print('記事の ID がおかしいので、ページを作りません:', aid)
            continue
        try:
            h = page_html(tpl, a)
        except ValueError as e:
            print('ひな形（kiji.html）に %s が見つからないので、記事ごとのページは作りません（今あるページはそのまま）' % e)
            return
        p = os.path.join(out, aid + '.html')
        if not os.path.exists(p) or open(p, encoding='utf-8').read() != h:
            with open(p, 'w', encoding='utf-8', newline='\n') as f:
                f.write(h)
            changed += 1
        made.append(aid)
    for f in sorted(os.listdir(out)):
        if f.endswith('.html') and f[:-5] not in made:
            os.remove(os.path.join(out, f))
            print('公開をやめた記事のページを外しました:', f)
    with open(os.path.join(out, 'list.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// tools/kiji-photos.py --pages が書く。ここにある ID の記事は k/<ID>.html で開く（LINE などで記事ごとの写真と題名が出る）\n')
        f.write('window.A4B_KIJI_PAGES = ' + json.dumps(sorted(made)) + ';\n')
    print('記事ごとのページ: %d 本（今回 作った・直した %d 本）' % (len(made), changed))


def main():
    prune = '--prune' in sys.argv
    url = gas_url()
    d = get(url)
    if not d.get('ok'):
        sys.exit('記事の一覧を読めませんでした: %s' % d.get('error'))
    ids = [p['id'] for a in d['articles'] for p in (a.get('photos') or [])]
    os.makedirs(DIR, exist_ok=True)
    added = 0
    for pid in ids:
        if not re.fullmatch(r'[A-Za-z0-9_-]+', pid):
            print('写真の ID がおかしいので飛ばします:', pid)
            continue
        path = os.path.join(DIR, pid + '.jpg')
        if os.path.exists(path):
            continue
        p = get(url + '?photo=' + urllib.parse.quote(pid))
        if not p.get('ok'):
            print('写真を読めませんでした:', pid, p.get('error'))
            continue
        im = Image.open(io.BytesIO(base64.b64decode(p['data'])))
        im = im.convert('RGB')
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        im.save(path, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        print('置きました: %s（%dx%d、%dKB）' % (pid, im.width, im.height, os.path.getsize(path) // 1024))
        added += 1
    have = sorted(f[:-4] for f in os.listdir(DIR) if f.endswith('.jpg') and not f.endswith('-s.jpg'))
    for x in have:
        make_small(x)
    gone = [x for x in have if x not in ids]
    if gone and prune:
        for x in gone:
            os.remove(os.path.join(DIR, x + '.jpg'))
            if os.path.exists(os.path.join(DIR, x + '-s.jpg')):
                os.remove(os.path.join(DIR, x + '-s.jpg'))
            print('公開をやめた記事の写真を消しました:', x)
            # 公開用で自動で足された写真を取り込むとき（kiji-sync.py）に、消したものを戻さないよう書いておく
            with open(os.path.join(HERE, 'kiji-pruned.txt'), 'a', encoding='utf-8') as f:
                f.write(x + '\n')
        have = [x for x in have if x not in gone]
    elif gone:
        print('公開をやめた記事の写真が %d 枚あります（サイトには出ません。消すなら社長のOKのあと --prune）: %s' % (len(gone), ' '.join(gone)))
    listed = [x for x in have if x in ids]
    with open(LIST_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// tools/kiji-photos.py が書く。ここにある ID の写真は assets/kiji/ から出す（ないものは GAS から）\n')
        f.write('window.A4B_KIJI_PHOTOS = ' + json.dumps(listed) + ';\n')
    print('置いた写真: %d 枚（今回 %d 枚）' % (len(listed), added))
    if '--pages' in sys.argv:
        make_pages(d['articles'])


if __name__ == '__main__':
    main()
