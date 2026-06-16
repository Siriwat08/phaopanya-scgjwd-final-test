function requestPermission() {
  // 1. บังคับให้ระบบเรียกใช้ Session (จุดประสงค์เพื่อกระตุ้น OAuth Popup)
  const email = Session.getActiveUser().getEmail();
  const effectiveEmail = Session.getEffectiveUser().getEmail();
  
  // 2. ใช้ console.log แทน getUi().alert()
  console.log('✅ ขออนุญาตสำเร็จ!');
  console.log('Active User: ' + email);
  console.log('Effective User: ' + effectiveEmail);
}
