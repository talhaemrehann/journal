# TradeLog - İşlem Günlüğü

Türkçe arayüzlü, yerel depolamalı trading backtest journal MVP uygulaması.

## Özellikler

- Performans kartları ve sermaye eğrisi
- Strateji bazlı özet
- İşlem ekleme, düzenleme ve silme
- Strateji, sembol, yön, sonuç ve tarihe göre filtreleme
- `localStorage` ile kalıcı demo ve kullanıcı verileri
- Responsive koyu trading-dashboard tasarımı
- OpenAI uyumlu AI işlem koçu: toplu günlüğü veya tek işlemi açık onayla gönderir; ekran görüntüleri isteğe bağlıdır

## Çalıştırma

```bash
npm install
npm run dev
```

## Kontroller

```bash
npm run lint
npm run build
```

## AI Koç Kurulumu ve Gizlilik

Uygulama içindeki **AI Koç** sekmesinden OpenAI uyumlu sağlayıcı ayarlarını açın:

- **Gemini (önerilen)** varsayılan sağlayıcıdır.
- Gemini API Base URL: `https://generativelanguage.googleapis.com/v1beta/openai`
- Gemini vision model varsayılan olarak `gemini-3.8-flash` değerini kullanır.
- Gemini anahtarı Google AI Studio’dan alınır; OpenAI uyumlu endpoint ile Bearer authentication kullanılır.
- OpenAI uyumlu sağlayıcı seçeneğiyle özel endpoint ve model kullanılabilir.
- API anahtarı yalnızca React oturum belleğinde tutulur; `localStorage` veya kaynak koduna kaydedilmez ve sayfa yenilenince temizlenir.
- Tarayıcıdan API anahtarı kullanmak üretim ortamı için önerilmez. Üretimde anahtar sunucu tarafında tutulan bir backend proxy üzerinden kullanılmalıdır.
- Veri gönderimi varsayılan olarak otomatik değildir. AI sekmesindeki onay seçeneklerini ve **Analizi Başlat** butonunu kullanmadan işlem verisi veya ekran görüntüsü gönderilmez.
- Tek işlem satırındaki `AI` eylemi ayrı bir onay modalı açar.
