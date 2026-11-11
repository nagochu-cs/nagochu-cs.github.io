// サイトの設定。ここだけ書き換えれば動く
window.A4B_CONFIG = {
  // GAS をウェブアプリとして公開したときの URL（…/exec）。空のあいだは「準備中」と出る
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyLQl9n9Bj75fzbqy9viEEXqrRJXs92KVLeALJeioV6OoSJyyE1Sh1A_KR0zGstuOsZ/exec',
  // 「関心のある方」の Google フォームの URL（createForms() のログに出る）
  CONTACT_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSfIyViAQpYERQJ2-QOD-em1rZ9VCyybC0HdjidzZfuICr2_Gw/viewform',
  // 活動名（GAS の ACTIVITIES と同じ並び）。slug はページ内の目印
  ACTIVITIES: [
    { name: 'てんたばる語れー会', slug: 'katare' },   // 2026-10-26 足した
    { name: '名護中まちなかクラブ', slug: 'machinaka' },
    { name: '朝ごはんPJ', slug: 'asagohan' },
    { name: 'てんたばる学校地域講座', slug: 'tentabaru' },
    { name: '学習支援', slug: 'gakushu' },             // 2026-11-11 「放課後学習支援」から変えた
    { name: '講演会・特別授業', slug: 'kouen' },
    { name: 'その他', slug: 'sonota' },               // 2026-10-26 足した。どれにも当たらない記事
  ],
  // 「学校のようす」の項目（GAS の SCHOOL_TOPICS と同じ並び。2026-11-10）。学校のホームページが閉じている間、教頭先生が日々の様子を載せる。
  // CS の活動の記事とは別のページ（gakkou.html）に出る。投稿は gakkou-toukou.html（教頭先生用の合言葉）
  SCHOOL_TOPICS: [
    { name: '授業', slug: 'g-jugyo' },
    { name: '学校行事', slug: 'g-gyoji' },
    { name: '部活動・生徒の活躍', slug: 'g-bukatsu' },
    { name: '生徒会・学級', slug: 'g-seito' },
    { name: '給食・保健', slug: 'g-kyushoku' },
    { name: '職員室・校内のようす', slug: 'g-kounai' },
  ],
  // 合言葉なしで足すリンク（2026-10-22）。シート（リンクの管理）の分と一緒に並ぶ。同じ URL がシートにあればシートの方を使う
  EXTRA_LINKS: {
    school: [
      { date: '2026-10-21', url: 'http://sw.city.nago.okinawa.jp/nago-c/archives/4918', title: '朝ごはんPJ（10月21日）' },
    ],
    insta: [
      { date: '2026-10-21', url: 'https://www.instagram.com/p/DevmW88E7Lj/', title: '10月21日の朝ごはんPJ（ジャーマンポテト・ピーマンとツナの和え物・味噌汁）' },
    ],
  },
  // お知らせの画像（2026-10-18）。キーはシート「お知らせ」の ID。1枚目が一覧の小さな画像になる。画像は assets/news/ に置く
  NEWS_IMAGES: {
    n2026111111043421: [   // 2026-11-11 朝の自習室（11/18）
      { src: 'assets/news/jishushitsu-20261118.jpg', alt: '朝の自習室のフライヤー（中学3年生向け。6:40〜7:50、家庭科室。11月18日・25日、12月2日・9日・23日）' },
    ],
    n2026101815000011: [
      { src: 'assets/news/asagohan-20261021.jpg', alt: '10月21日の献立の見本（ピーマンとツナの和え物・ジャーマンポテト・味噌汁・ご飯）' },
      { src: 'assets/news/asagohan-20261021-kondate.jpg', alt: '10月21日のカロリー内訳の表' },
    ],
    n2026101815000012: [
      { src: 'assets/news/asagohan-20261028.jpg', alt: '10月28日の献立の見本（キャベツと卵の中華スープ・豚の生姜焼き・野菜サラダ・ご飯）' },
      { src: 'assets/news/asagohan-20261028-kondate.jpg', alt: '10月28日のカロリー内訳の表' },
    ],
    n2026101815000013: [
      { src: 'assets/news/tentabaru-20261028.jpg', alt: 'てんたばる学校地域講座（10月28日）のチラシ' },
    ],
    n2026102711300001: [
      { src: 'assets/news/yume-20261102.jpg', alt: '池江璃花子選手による夢授業（11月2日）のチラシ（申し込みは終了）' },
    ],
    n2026110217470770: [
      { src: 'assets/news/asagohan-20261104.jpg', alt: '11月4日の献立の見本（クラムチャウダー・キャベツとコーンのコールスロー・ご飯）' },
      { src: 'assets/news/asagohan-20261104-kondate.jpg', alt: '11月4日のカロリー内訳の表' },
    ],
    n2026110515512122: [
      { src: 'assets/news/nagochusai-20261118.jpg', alt: '名護中祭（11月18日・放課後・名護中体育館）のポスター' },
    ],
  },
  // 詳細に「手伝いたい方はこちら」を出さないお知らせの ID（市の主催など、手伝いを募らないもの。2026-10-27）
  NEWS_NO_HELP: ['n2026102711300001', 'n2026110515512122'],
};
