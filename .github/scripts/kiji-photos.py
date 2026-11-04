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


if __name__ == '__main__':
    main()
