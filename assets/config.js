// サイトの設定。ここだけ書き換えれば動く
window.A4B_CONFIG = {
  // GAS をウェブアプリとして公開したときの URL（…/exec）。空のあいだは「準備中」と出る
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyLQl9n9Bj75fzbqy9viEEXqrRJXs92KVLeALJeioV6OoSJyyE1Sh1A_KR0zGstuOsZ/exec',
  // 「関わりたい方へ」の Google フォームの URL（createForms() のログに出る）
  CONTACT_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSfIyViAQpYERQJ2-QOD-em1rZ9VCyybC0HdjidzZfuICr2_Gw/viewform',
  // 活動名（GAS の ACTIVITIES と同じ並び）。slug はページ内の目印
  ACTIVITIES: [
    { name: '名護中まちなかクラブ', slug: 'machinaka' },
    { name: '朝ごはんPJ', slug: 'asagohan' },
    { name: 'てんたばる学校地域講座', slug: 'tentabaru' },
    { name: '放課後学習支援', slug: 'gakushu' },
    { name: '講演会・特別授業', slug: 'kouen' },
  ],
};
