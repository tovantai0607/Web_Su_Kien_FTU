/** Keep the supplied logo strip intact, including its original spacing and transparency. */
export default function PartnerStrip() {
  return (
    <section className="partner-strip" aria-label="Đơn vị tổ chức và đồng hành">
      <img
        src="/images/partner-strip-original.png"
        width="3000"
        height="298"
        alt="Đại học Ngoại thương, Đoàn Thanh niên, Hội Sinh viên, LiS, FTUCharm – Duyên dáng Ngoại thương, COSMO Academy và UNI media"
        loading="lazy"
      />
    </section>
  );
}
