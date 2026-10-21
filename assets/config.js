// サイトの設定。ここだけ書き換えれば動く
window.A4B_CONFIG = {
  // GAS をウェブアプリとして公開したときの URL（…/exec）。空のあいだは「準備中」と出る
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyLQl9n9Bj75fzbqy9viEEXqrRJXs92KVLeALJeioV6OoSJyyE1Sh1A_KR0zGstuOsZ/exec',
  // 「関心のある方」の Google フォームの URL（createForms() のログに出る）
  CONTACT_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSfIyViAQpYERQJ2-QOD-em1rZ9VCyybC0HdjidzZfuICr2_Gw/viewform',
  // 活動名（GAS の ACTIVITIES と同じ並び）。slug はページ内の目印
  ACTIVITIES: [
    { name: '名護中まちなかクラブ', slug: 'machinaka' },
    { name: '朝ごはんPJ', slug: 'asagohan' },
    { name: 'てんたばる学校地域講座', slug: 'tentabaru' },
    { name: '放課後学習支援', slug: 'gakushu' },
    { name: '講演会・特別授業', slug: 'kouen' },
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
  },
};
