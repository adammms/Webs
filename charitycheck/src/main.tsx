import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ShieldCheck,
  Landmark,
  QrCode,
  LockKeyhole,
  Search,
  FileCheck2,
  Info,
  LoaderCircle,
  RefreshCw,
  AlertCircle,
  HeartHandshake,
} from "lucide-react";
import {
  banks,
  recipientTypes,
  statusLabels,
  verificationSchema,
  type Report,
  type Finding,
} from "../server/schema";
import "./styles.css";
const initial = {
  bank: "",
  accountNumber: "",
  recipient: { type: "", name: "", website: "", purpose: "" },
};
type Form = typeof initial;
function App() {
  const [form, setForm] = useState<Form>(initial),
    [report, setReport] = useState<Report | null>(null),
    [state, setState] = useState<
      "empty" | "typing" | "checking" | "done" | "error"
    >("empty"),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState<"bank" | "qris">("bank");
  const [providerConfigured, setProviderConfigured] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/capabilities", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("unavailable");
        return r.json();
      })
      .then((data) =>
        setProviderConfigured(data.bankProvider?.configured === true),
      )
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const generation = useRef(0),
    reportRef = useRef<HTMLElement>(null);
  const validation = verificationSchema.safeParse(form);
  const valid = validation.success;
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    setReport(null);
    setError("");
    if (tab !== "bank" || !verificationSchema.safeParse(form).success) {
      setState(form.accountNumber || form.recipient.name ? "typing" : "empty");
      return () => controller.abort();
    }
    setState("typing");
    const timer = setTimeout(async () => {
      setState("checking");
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);
      try {
        const response = await fetch("/api/verifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Layanan tidak tersedia.");
        if (version === generation.current && !controller.signal.aborted) {
          setReport(data);
          setState("done");
        }
      } catch (e) {
        if (
          version === generation.current &&
          (!controller.signal.aborted || timedOut)
        ) {
          setState("error");
          setError(
            timedOut
              ? "Pemeriksaan melewati batas waktu. Silakan coba kembali."
              : e instanceof Error
                ? e.message
                : "Koneksi terputus. Silakan coba kembali.",
          );
        }
      } finally {
        clearTimeout(deadline);
      }
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, tab, retry]);
  function field(key: "bank" | "accountNumber", value: string) {
    setReport(null);
    setForm((f) => ({ ...f, [key]: value }));
  }
  function recipientField(key: keyof Form["recipient"], value: string) {
    setReport(null);
    setForm((f) => ({ ...f, recipient: { ...f.recipient, [key]: value } }));
  }
  const bank = banks.find((b) => b.code === form.bank);
  const accountError =
    form.accountNumber &&
    (!/^\d+$/.test(form.accountNumber) ||
      (bank && form.accountNumber.length !== bank.min));
  return (
    <>
      <header className="site-header">
        <div className="page-width header-inner">
          <a className="brand" href="#">
            <span className="brand-mark">
              <ShieldCheck size={23} />
            </span>
            charity<span className="brand-light">check</span>
            <span className="beta">BETA</span>
          </a>
          <nav aria-label="Navigasi utama">
            <a className="nav-active" href="#verifikasi">
              Verifikasi donasi
            </a>
            <a href="#cara-kerja">Cara kerja</a>
          </nav>
          <a className="header-about" href="#tentang">
            Tentang CharityCheck <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <main>
        <section className="hero page-width">
          <div className="eyebrow">
            <span className="tiny-dot" /> INFORMASI LEBIH JELAS. BERBAGI LEBIH
            TENANG.
          </div>
          <h1>
            Niat baik dimulai dari
            <br />
            <span>informasi yang tepat.</span>
          </h1>
          <p>
            Kenali rekening dan penerima donasi sebelum Anda berbagi.
            <br className="desktop-break" /> Pemeriksaan independen, transparan,
            dan menjaga privasi.
          </p>
          <div className="hero-assurances">
            <span>
              <LockKeyhole size={14} /> Data pribadi terlindungi
            </span>
            <span>
              <CheckCheck size={16} /> Hasil berbasis sumber
            </span>
            <span>
              <HeartHandshake size={16} /> Tanpa memproses donasi
            </span>
          </div>
        </section>
        <div className="workspace page-width" id="verifikasi">
          <section className="form-card" aria-labelledby="form-title">
            <div className="card-topline">
              <span className="section-overline">MULAI PEMERIKSAAN</span>
              <span className="step-pill">
                01 <span>/ 02</span>
              </span>
            </div>
            <h2 id="form-title">Periksa informasi donasi</h2>
            <p className="muted form-intro">
              Isi informasi yang Anda terima dari penggalang dana.
            </p>
            <div
              className="method-tabs"
              role="tablist"
              aria-label="Metode pembayaran"
            >
              <button
                role="tab"
                aria-selected={tab === "bank"}
                onClick={() => setTab("bank")}
                className={tab === "bank" ? "selected" : ""}
              >
                <Landmark size={18} /> Rekening bank
              </button>
              <button
                role="tab"
                aria-selected={tab === "qris"}
                onClick={() => setTab("qris")}
                className={tab === "qris" ? "selected" : ""}
              >
                <QrCode size={18} /> QRIS <span className="soon">Segera</span>
              </button>
            </div>
            {tab === "qris" ? (
              <div className="qris-empty">
                <QrCode size={40} />
                <h3>Pemeriksaan QRIS sedang disiapkan</h3>
                <p>
                  Pembacaan gambar dan konfirmasi merchant masuk pengembangan
                  berikutnya. Belum ada file yang diunggah atau disimpan.
                </p>
                <button className="text-button" onClick={() => setTab("bank")}>
                  Gunakan rekening bank <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (report)
                    reportRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  else if (state === "error") setRetry((r) => r + 1);
                }}
              >
                <div className="section-heading">
                  <span className="number-circle">1</span>
                  <h3>Informasi rekening</h3>
                </div>
                <div className="payment-grid">
                  <label>
                    Bank tujuan <span className="required">*</span>
                    <span className="select-wrap">
                      <select
                        required
                        aria-label="Bank tujuan"
                        value={form.bank}
                        onChange={(e) => field("bank", e.target.value)}
                      >
                        <option value="" disabled>
                          Pilih bank
                        </option>
                        {banks.map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} />
                    </span>
                  </label>
                  <label>
                    Nomor rekening <span className="required">*</span>
                    <input
                      required
                      aria-invalid={!!accountError}
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={15}
                      placeholder="Masukkan nomor rekening"
                      value={form.accountNumber}
                      onChange={(e) => field("accountNumber", e.target.value)}
                    />
                  </label>
                </div>
                {accountError ? (
                  <p className="field-error">
                    {bank
                      ? `Gunakan ${bank.min} digit angka untuk format umum ${bank.name}.`
                      : "Gunakan hanya angka pada nomor rekening."}
                  </p>
                ) : (
                  <p className="field-note">
                    <LockKeyhole size={12} /> Nomor rekening tidak disimpan
                    dalam bentuk asli.
                  </p>
                )}
                <div className="form-divider" />
                <div className="section-heading">
                  <span className="number-circle">2</span>
                  <h3>Informasi penerima donasi</h3>
                </div>
                <div className="recipient-grid">
                  <label>
                    Jenis penerima <span className="required">*</span>
                    <span className="select-wrap">
                      <select
                        required
                        aria-label="Jenis penerima"
                        value={form.recipient.type}
                        onChange={(e) => recipientField("type", e.target.value)}
                      >
                        <option value="" disabled>
                          Pilih jenis penerima
                        </option>
                        {recipientTypes.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} />
                    </span>
                  </label>
                  <label>
                    Nama penerima <span className="required">*</span>
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      autoComplete="off"
                      placeholder="Nama yayasan / penerima"
                      value={form.recipient.name}
                      onChange={(e) => recipientField("name", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Website atau akun media sosial{" "}
                  <span className="required">*</span>
                  <input
                    required
                    type="url"
                    maxLength={300}
                    placeholder="https://website.org atau tautan profil sosial"
                    value={form.recipient.website}
                    onChange={(e) => recipientField("website", e.target.value)}
                  />
                </label>
                {form.recipient.website &&
                  !/^https?:\/\//.test(form.recipient.website) && (
                    <p className="field-error">
                      Gunakan tautan lengkap yang diawali https://.
                    </p>
                  )}
                <label>
                  Tujuan penggalangan dana <span className="required">*</span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={3}
                    placeholder="Ceritakan secara singkat untuk apa donasi ini digunakan"
                    value={form.recipient.purpose}
                    onChange={(e) => recipientField("purpose", e.target.value)}
                  />
                </label>
                <div className="auto-state" aria-live="polite">
                  {state === "checking" ? (
                    <>
                      <LoaderCircle size={15} className="spin" /> Memeriksa
                      informasi rekening dan penerima...
                    </>
                  ) : state === "done" ? (
                    <>
                      <Check size={15} /> Laporan pemeriksaan tersedia di bawah.
                    </>
                  ) : valid ? (
                    <>
                      <LoaderCircle size={15} className="spin" /> Menyiapkan
                      pemeriksaan otomatis...
                    </>
                  ) : (
                    <>
                      <Info size={15} /> Pemeriksaan berjalan otomatis setelah
                      data lengkap.
                    </>
                  )}
                </div>
                {error && (
                  <div className="error-box" role="alert">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => setRetry((r) => r + 1)}
                      aria-label="Coba kembali"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!report && state !== "error"}
                >
                  {state === "checking" ? (
                    <>
                      <LoaderCircle className="spin" size={18} /> Sedang
                      memeriksa
                    </>
                  ) : state === "error" ? (
                    <>
                      Coba kembali <RefreshCw size={17} />
                    </>
                  ) : (
                    <>
                      Lihat hasil pemeriksaan <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p className="form-footnote">
                  Dengan melanjutkan, Anda memahami{" "}
                  <a href="#privasi">cara kami menjaga data Anda</a>.
                </p>
              </form>
            )}
          </section>
          <aside className="side-column">
            <section className="trust-card" id="cara-kerja">
              <div className="side-icon">
                <ShieldCheck size={25} />
              </div>
              <h2>
                Satu langkah kecil,
                <br />
                untuk niat baik Anda.
              </h2>
              <p>
                CharityCheck membantu Anda memahami informasi donasi, bukan
                mengambil keputusan untuk Anda.
              </p>
              <div className="trust-list">
                <div>
                  <span>
                    <Search size={18} />
                  </span>
                  <div>
                    <h3>Periksa informasi</h3>
                    <p>
                      Format rekening dan data penerima diperiksa secara
                      terpisah.
                    </p>
                  </div>
                </div>
                <div>
                  <span>
                    <FileCheck2 size={18} />
                  </span>
                  <div>
                    <h3>Pahami hasilnya</h3>
                    <p>
                      Lihat sumber, waktu, dan hal yang belum dapat
                      dikonfirmasi.
                    </p>
                  </div>
                </div>
                <div>
                  <span>
                    <HeartHandshake size={18} />
                  </span>
                  <div>
                    <h3>Putuskan dengan bijak</h3>
                    <p>
                      Konfirmasi langsung melalui kanal resmi sebelum berdonasi.
                    </p>
                  </div>
                </div>
              </div>
              <div className="side-footer">
                <LockKeyhole size={14} />
                <span>Kami tidak menerima atau menyalurkan donasi.</span>
              </div>
            </section>
            <section className="notice-card">
              <Info size={19} />
              <div>
                <h3>Transparan sejak awal</h3>
                <p>
                  {providerConfigured
                    ? "Integrasi pemeriksaan rekening sudah dikonfigurasi. Hasil mengikuti respons penyedia pada setiap pemeriksaan; legalitas penerima dan keaslian kampanye tetap belum dikonfirmasi."
                    : "Penyedia verifikasi resmi belum dikonfigurasi. Hasil saat ini memeriksa kelengkapan dan format, bukan mengonfirmasi kepemilikan rekening."}
                </p>
                <a href="#tentang">
                  Pahami batasan pemeriksaan <ArrowUpRight size={13} />
                </a>
              </div>
            </section>
          </aside>
        </div>
        {report && (
          <section
            className="page-width report-section"
            ref={reportRef}
            aria-labelledby="report-title"
          >
            <div className="report-header">
              <div>
                <span className="section-overline">LAPORAN PEMERIKSAAN</span>
                <h2 id="report-title">Informasi untuk langkah berikutnya</h2>
              </div>
              <span className="report-id">#{report.id.slice(0, 8)}</span>
            </div>
            <div className="report-summary">
              <AlertCircle size={24} />
              <div>
                <h3>{statusLabels[report.overall.status]}</h3>
                <p>{report.overall.reason}</p>
              </div>
            </div>
            <div className="report-meta">
              <span>
                {report.bank} · {report.accountMasked}
              </span>
              <span>Penerima: {report.recipientMasked}</span>
              {report.holderMasked && (
                <span>Pemilik: {report.holderMasked}</span>
              )}
              <span>
                Diperiksa {new Date(report.checkedAt).toLocaleString("id-ID")}
              </span>
              <span>
                Periksa ulang setelah{" "}
                {new Date(report.expiresAt).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="findings-grid">
              <FindingCard title="Rekening bank" finding={report.payment} />
              <FindingCard
                title="Identitas penerima"
                finding={report.recipient}
              />
              <FindingCard title="Kecocokan informasi" finding={report.match} />
            </div>
            <div className="recommendations">
              <h3>Sebelum Anda berbagi</h3>
              <ul>
                {report.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p>{report.limitations.join(" ")}</p>
            </div>
          </section>
        )}
        <section className="bottom-note page-width" id="tentang">
          <ShieldCheck size={20} />
          <p>
            <strong>Informasi, bukan jaminan.</strong> Rekening yang
            terkonfirmasi tidak otomatis membuat kampanye donasi terverifikasi.
            CharityCheck tidak memberikan penilaian bahwa seseorang melakukan
            penipuan.
          </p>
        </section>
        <section className="privacy page-width" id="privasi">
          <h2>Privasi Anda, bagian dari pemeriksaan.</h2>
          <p>
            Nomor rekening dan data penerima diproses sementara, lalu tidak
            disimpan. Audit internal hanya berisi kode status, waktu, bank, dan
            sidik HMAC rekening. Audit dihapus sesuai masa retensi (default 30
            hari); tidak ada riwayat publik. Belum ada dokumen atau gambar yang
            diterima.
          </p>
        </section>
      </main>
      <footer className="site-footer page-width">
        <span className="footer-brand">
          <ShieldCheck size={17} /> charitycheck
        </span>
        <p>Periksa sebelum berbagi.</p>
        <span>Platform independen · Indonesia</span>
      </footer>
    </>
  );
}
function FindingCard({ title, finding }: { title: string; finding: Finding }) {
  return (
    <article className="finding-card">
      <h3>{title}</h3>
      <span className={`status-badge status-${finding.status}`}>
        {statusLabels[finding.status]}
      </span>
      <p>{finding.reason}</p>
      <small>
        Sumber: {finding.source}
        <br />
        {new Date(finding.checkedAt).toLocaleString("id-ID")}
      </small>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
