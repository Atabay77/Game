# 🏝️ Issız Ada 3B — Çok Oyunculu Hayatta Kalma

Arkadaşlarınla **aynı ağda (LAN)** oynanan, tarayıcıda çalışan 3B hayatta kalma oyunu.
Kaynak topla, alet üret, barınak kur, geceden ve hayvanlardan kurtul ve birlikte
bir **kaçış salı** yapıp adadan kaçın.

Three.js (3B) + Node.js/WebSocket (sunucu). Hazır model/ses dosyası yok — her şey
kodla üretiliyor.

---

## Kurulum (tek seferlik)

1. **Node.js 18+** kurulu olmalı → <https://nodejs.org> (LTS sürümü yeter).
2. Bu klasörde bir terminal aç ve şunu çalıştır:

```bash
npm install
```

## Oyunu başlatma

```bash
npm start
```

Terminalde şuna benzer bir çıktı göreceksin:

```
  🏝️  ISSIZ ADA 3B — sunucu ayakta

  Bu bilgisayarda:  http://localhost:3000
  Arkadaşların:     http://192.168.1.34:3000
```

- **Sen** `http://localhost:3000` adresini tarayıcıda aç.
- **Arkadaşların** aynı Wi-Fi/ağa bağlanıp `http://192.168.1.34:3000` (sendeki
  ikinci satırda yazan adres) adresini kendi tarayıcılarına yazsın.
- Herkes adını yazıp **Adaya Çık** desin. Hepiniz aynı dünyadasınız.

> Bağlanamazlarsa bilgisayarının güvenlik duvarı 3000 portunu engelliyordur;
> Node.js'e ağ izni ver ya da `PORT=8080 npm start` ile başka bir port dene.

### Telefondan oynamak

Telefon aynı Wi-Fi'a bağlıysa tarayıcıya yukarıdaki `http://192.168...` adresini
yazması yeterli — uygulama indirmeye gerek yok. Oyun dokunmatik olduğunu kendi
anlar ve ekran kontrollerini açar:

| Kontrol | İş |
|---|---|
| Sol alttaki yuvarlak | yürü (ne kadar iterisen o kadar hızlı) |
| Ekranın boş yerine parmakla sürükle | etrafa bak |
| Sağ alttaki büyük düğme | topla / saldır / balık tut (bastığın şeye göre değişir) |
| **KULLAN** | ateş, sandık, tezgâh, barınak, sal |
| **ZIPLA** · **KOŞ** | zıpla · koşmayı aç-kapat |
| Sol üstteki sıra | 🔨 üretim · 🎒 çanta · 💬 sohbet · 🔦 meşale · ⛶ tam ekran · ⚙ ayarlar |

Yapı kurarken büyük düğme **KUR**, yanındakiler **DÖNDÜR** ve **İPTAL** olur.
Telefonu yan çevirmen önerilir; dikeyken uyarı çıkar ama yine de oynanır.
Performans için telefonda gölgeler kapalı ve görüş mesafesi kısa başlar —
⚙ ayarlardan değiştirebilirsin.

Sunucuyu kapatmak için terminalde `Ctrl+C`. Dünya `world.save.json` dosyasına
otomatik kaydedilir; tekrar başlattığında kaldığınız yerden devam edersiniz.
Sıfırdan başlamak için o dosyayı sil.

---

## Kontroller

| Tuş | İş |
|---|---|
| `W A S D` | yürü |
| `Shift` | koş (enerji harcar) |
| `Boşluk` | zıpla / suda yüzeye çık |
| `Fare` | etrafa bak (ekrana tıklayınca fare kilitlenir) |
| **Sol tık (basılı tut)** | kaynak topla / balık tut / saldır |
| `E` | yapıyı kullan (ateş, damıtıcı, sandık, tezgâh, barınak, sal) |
| `C` | üretim menüsü |
| `Tab` | çanta |
| `1` – `6` | alet seç · `F` meşaleyi yak/söndür |
| `T` veya `Enter` | sohbet |
| `R` | yapı yerleştirirken döndür |
| `Esc` | menü / iptal |

---

## Nasıl oynanır

1. **Topla.** Çalılardan lif ve meyve, ağaçlardan odun, kayalardan taş ve şanslıysan
   hurda metal çıkar. Kumsaldaki **gemi enkazları** metal ve yelken bezi verir.
2. **Alet yap** (`C`). Taş balta odun toplamayı, taş kazma taş kırmayı iki katına
   çıkarır. Mızrak hem en güçlü silahtır hem de kıyıda balık tutmanı hızlandırır.
3. **Kamp ateşi kur.** Isıtır, aydınlatır, çiğ et ve balığı pişirir. Çiğ yersen
   hastalanırsın. Ateş odunla beslenir, yağmurda daha çabuk söner.
4. **Su bul.** Deniz suyu içilmez. Hindistan cevizi su verir, **su damıtıcısı**
   sürekli temiz su üretir, yağmurda susuzluğun kendiliğinden azalır.
5. **Barınak kur.** Ölünce orada uyanırsın. Ekipteki *herkes* barınakta uyursa
   gece atlanır.
6. **Çalışma tezgâhı** kur; metal aletler ve sal ancak tezgâhın yanında yapılır.
7. **Ortak sandık** ile takım arkadaşlarınla malzeme paylaş.
8. **Kaçış salını** kumsala kur (tezgâhı da kumsala kurmayı unutma), `E` ile
   geri sayımı başlat ve 30 saniye içinde herkes salın yanına gelsin. Salın
   yanındaki herkes kurtulur.

## Tehlikeler

- **Açlık / susuzluk** sıfırlanınca canın erir.
- **Gece soğuğu**: karanlıkta yanan bir ateşin yakınında değilsen can kaybedersin.
  Meşale taşımak görüşünü açar ama ısıtmaz.
- **Yaban domuzları** gündüz sakindir, gece saldırganlaşır ve çoğalır.
- **Köpekbalıkları** derin suda yüzenlerin peşine düşer.
- **Fırtına**: görüş azalır, deniz kabarır, şimşek çakar, ateşler çabuk söner.
- Ölünce eşyalarının yarısını kaybedersin, barınağında (yoksa kumsalda) uyanırsın.

---

## Teknik notlar

```
island3d/
├── server/index.js      # oyun sunucusu (otorite): kaynaklar, envanter, hayvanlar, zaman
├── shared/              # sunucu ve tarayıcının ortak kullandığı kod
│   ├── constants.js     # eşyalar, tarifler, dengeleme sayıları
│   └── terrain.js       # deterministik ada arazisi (iki taraf da aynı zemini üretir)
└── public/              # tarayıcı istemcisi
    ├── index.html · style.css
    └── js/  main · world · controls · entities · ui · net · sfx
```

- Dünya sunucuda simüle edilir, istemciler saniyede 10 kez durum alır; hareket
  istemcide anında uygulanır, araya interpolasyon konur.
- Arazi bir yükseklik fonksiyonundan üretilir ve **aynı tohumla** her iki tarafta
  birebir aynı çıkar; böylece zemin ve çarpışmalar uyuşur.
- Ağaç/kaya/çalı gibi yüzlerce nesne `InstancedMesh` ile tek çizim çağrısında
  çizilir.
- Dengeleme sayıları `shared/constants.js` içinde — açlık hızı, hasar, tarif
  maliyetleri hepsi oradan değiştirilebilir.
- `DEV_CHEATS=1 npm start` ile başlatırsan tarayıcı konsolundan
  `__dbg.net.send({t:'give', items:{odun:100}})` yazarak test için eşya alabilirsin.
