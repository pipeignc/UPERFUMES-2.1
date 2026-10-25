/* =========================================================================
   UPerfumes — script.js
   Sin carrito, sin lógica de compra: solo interacciones de presentación.
   1. Menú móvil (abrir/cerrar)
   2. Encabezado que se vuelve sólido al hacer scroll
   3. Marcador de posición automático para fotos que aún no existen
   4. Filtro de catálogo por familia olfativa
   5. Revelado de la cuadrícula al entrar en pantalla (una sola vez)
   6. Contador animado de las cifras de la colección
   ========================================================================= */
(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Almacenamiento del navegador, tolerante a fallos (modo privado estricto,
  // cookies bloqueadas, etc.): si no está disponible, simplemente no se guarda.
  function storeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* sin almacenamiento: no pasa nada */
    }
  }

  /* ---------------------------------------------------------------------
     1. Menú móvil
     --------------------------------------------------------------------- */
  var navToggle = document.getElementById("navToggle");
  var siteNav = document.getElementById("siteNav");

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", function () {
      var isOpen = siteNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute("aria-label", t(isOpen ? "navToggleClose" : "navToggleOpen"));
    });

    // Cierra el menú al elegir una sección (útil en móvil)
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        siteNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", t("navToggleOpen"));
      });
    });
  }

  /* ---------------------------------------------------------------------
     2. Encabezado sólido al hacer scroll
     --------------------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  if (header) {
    var updateHeader = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  /* ---------------------------------------------------------------------
     3. Marcador de posición automático para imágenes faltantes
     --------------------------------------------------------------------- 
     Cada <img> del catálogo apunta a una ruta sugerida (por ejemplo
     "images/dior-sauvage-edt.jpg"). Si ese archivo no existe todavía,
     el navegador dispara el evento "error" y aquí mostramos el recuadro
     con las instrucciones en su lugar. En cuanto subas la foto con el
     nombre correcto, esto deja de aplicarse automáticamente.
  */
  function bindImageFallback(img) {
    var wrapper = img.closest(".perfume-card__image");
    if (!wrapper) return;

    img.addEventListener("error", function () {
      img.classList.add("img-missing");
      wrapper.classList.add("is-missing");
    });

    // Si por algún motivo la imagen ya estaba en caché con error
    if (img.complete && img.naturalWidth === 0) {
      img.classList.add("img-missing");
      wrapper.classList.add("is-missing");
    }
  }

  document
    .querySelectorAll(".perfume-card__image img")
    .forEach(bindImageFallback);

  /* ---------------------------------------------------------------------
     4. Filtro de catálogo por familia olfativa
     --------------------------------------------------------------------- */
  var filters = document.getElementById("filters");
  var grid = document.getElementById("perfumeGrid");
  var emptyMsg = document.getElementById("filtersEmpty");

  if (filters && grid) {
    var chips = filters.querySelectorAll(".filter-chip");
    var cards = grid.querySelectorAll(".perfume-card");

    filters.addEventListener("click", function (e) {
      var chip = e.target.closest(".filter-chip");
      if (!chip) return;

      chips.forEach(function (c) {
        c.classList.remove("is-active");
        c.setAttribute("aria-selected", "false");
      });
      chip.classList.add("is-active");
      chip.setAttribute("aria-selected", "true");

      var family = chip.getAttribute("data-filter");
      var visibleCount = 0;

      cards.forEach(function (card) {
        var matches = family === "todos" || card.dataset.family === family;
        card.classList.toggle("is-filtered-out", !matches);
        if (matches) visibleCount++;
      });

      if (emptyMsg) emptyMsg.hidden = visibleCount !== 0;
    });
  }

  /* ---------------------------------------------------------------------
     5. Revelado de la cuadrícula al entrar en pantalla (una sola vez)
     --------------------------------------------------------------------- */
  if (grid) {
    var gridCards = grid.querySelectorAll(".perfume-card");
    gridCards.forEach(function (card, i) {
      card.style.setProperty("--i", i % 6); // agrupa el stagger en tandas
    });

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      grid.classList.add("is-visible");
    } else {
      var gridObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              grid.classList.add("is-visible");
              gridObserver.disconnect();
            }
          });
        },
        { threshold: 0.08 }
      );
      gridObserver.observe(grid);
    }
  }

  /* ---------------------------------------------------------------------
     6. Contador animado de las cifras de la colección
     --------------------------------------------------------------------- */
  var statNumbers = document.querySelectorAll(".stat-number");

  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;

    if (prefersReducedMotion) {
      el.textContent = target;
      return;
    }

    var start = 0;
    var duration = 900;
    var startTime = null;

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
      el.textContent = Math.round(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (statNumbers.length) {
    if (!("IntersectionObserver" in window)) {
      statNumbers.forEach(animateCount);
    } else {
      var statsObserver = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.6 }
      );
      statNumbers.forEach(function (el) {
        statsObserver.observe(el);
      });
    }
  }

  /* ---------------------------------------------------------------------
     7. Recomendador de perfumes (ocasión, clima, edad, presupuesto)
     ---------------------------------------------------------------------
     Es un motor de recomendación por reglas y pesos (content-based),
     no un modelo entrenado: cada fragancia tiene "etiquetas" (ocasiones,
     climas, rango de edad y presupuesto orientativo) y se compara contra
     lo que elige la persona. Es determinista y explicable a propósito,
     algo importante quando solo hay 11 productos en el catálogo.

     budget usa tres niveles orientativos ("accesible", "medio", "alto")
     según el posicionamiento habitual de cada fragancia en el mercado;
     no son precios exactos ni implican una tienda o carrito.
  */
  /* Cada perfume trae su ficha en tres idiomas (es/en/pt): family, desc y
     notes (top/heart/base). house, name y badge NO se traducen — son
     nombres propios y abreviaturas de la industria, iguales en cualquier
     idioma. Las notas se guardan como listas de materias primas (sin la
     etiqueta "Salida/Top/Saída" incluida): esa etiqueta viene de I18N y
     se arma en el momento, para no repetirla 11 veces por idioma. */
  var PERFUMES = [
    {
      id: "dior-sauvage-edt",
      house: "Dior",
      name: "Sauvage",
      badge: "EDT",
      occasions: ["diario", "oficina", "cita"],
      climates: ["calido", "templado"],
      ageMin: 18, ageMax: 45,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Aromática especiada", desc: "Fresca y versátil, con bergamota y una base mineral de ambroxán. Funciona casi cualquier día, de la oficina a una cita informal.",
          notes: { top: "bergamota, pimienta", heart: "pimienta de Sichuan, lavanda, geranio", base: "ambroxán, cedro, labdanum" } },
        en: { family: "Aromatic spicy", desc: "Fresh and versatile, with bergamot over a mineral ambroxan base. Works almost any day, from the office to a casual date.",
          notes: { top: "bergamot, pepper", heart: "Sichuan pepper, lavender, geranium", base: "ambroxan, cedar, labdanum" } },
        pt: { family: "Aromática especiada", desc: "Fresca e versátil, com bergamota sobre uma base mineral de ambroxan. Funciona em quase qualquer ocasião, do escritório a um encontro informal.",
          notes: { top: "bergamota, pimenta", heart: "pimenta-de-sichuan, lavanda, gerânio", base: "ambroxan, cedro, labdano" } }
      }
    },
    {
      id: "invictus-victory-elixir",
      house: "Paco Rabanne",
      name: "Invictus Victory Elixir",
      badge: "Elixir",
      occasions: ["noche", "cita", "formal"],
      climates: ["frio", "templado"],
      ageMin: 26, ageMax: 45,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Ambarada especiada", desc: "Un elixir denso de cardamomo, incienso y vainilla. Pensado para noches frías y ocasiones donde quieres notarse.",
          notes: { top: "lavandina, cardamomo verde, pimienta negra", heart: "incienso, pachulí", base: "vainilla, haba tonka" } },
        en: { family: "Amber spicy", desc: "A dense elixir of cardamom, incense and vanilla. Built for cold nights and occasions where you want to be noticed.",
          notes: { top: "lavandin, green cardamom, black pepper", heart: "incense, patchouli", base: "vanilla, tonka bean" } },
        pt: { family: "Âmbar especiado", desc: "Um elixir denso de cardamomo, incenso e baunilha. Pensado para noites frias e ocasiões em que queres notar-te.",
          notes: { top: "lavandim, cardamomo verde, pimenta-preta", heart: "incenso, pachuli", base: "baunilha, fava-tonka" } }
      }
    },
    {
      id: "dior-homme-intense",
      house: "Dior",
      name: "Homme Intense",
      badge: "EDP",
      occasions: ["noche", "formal", "cita"],
      climates: ["frio"],
      ageMin: 26, ageMax: 60,
      budget: "alto",
      prices: { 3: 9990, 5: 14990, 10: 26990 },
      i18n: {
        es: { family: "Floral amaderada", desc: "Iris polvoriento y un toque de cacao sobre cedro y vetiver. Elegante y algo golosa, ideal para eventos formales en climas fríos.",
          notes: { top: "lavanda", heart: "iris, ambrette, pera", base: "cedro de Virginia, vetiver" } },
        en: { family: "Floral woody", desc: "An unconventional take on masculinity: powdery iris and a touch of cocoa over cedar and vetiver. Elegant and slightly gourmand, ideal for formal events in cold weather.",
          notes: { top: "lavender", heart: "iris, ambrette, pear", base: "Virginia cedar, vetiver" } },
        pt: { family: "Floral amadeirada", desc: "Uma leitura pouco convencional da masculinidade: íris pulverulenta e um toque de cacau sobre cedro e vetiver. Elegante e ligeiramente gulosa, ideal para eventos formais em climas frios.",
          notes: { top: "lavanda", heart: "íris, ambrette, pera", base: "cedro-da-virgínia, vetiver" } }
      }
    },
    {
      id: "valentino-born-in-roma-extradose",
      house: "Valentino",
      name: "Uomo Born in Roma Extradose",
      badge: "Extradose",
      occasions: ["noche", "cita", "formal"],
      climates: ["frio"],
      ageMin: 25, ageMax: 45,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Fougère amaderada", desc: "La versión más intensa de Born in Roma: especias envolventes y lavandina sobre un fondo de vetiver y madera de guayaco, pensada para la noche.",
          notes: { top: "mezcla de especias, bergamota", heart: "lavandina", base: "vetiver, madera de guayaco" } },
        en: { family: "Woody fougère", desc: "The most intense version of Born in Roma: enveloping spices and lavandin over a base of vetiver and guaiac wood, built for the night.",
          notes: { top: "spice blend, bergamot", heart: "lavandin", base: "vetiver, guaiac wood" } },
        pt: { family: "Fougère amadeirada", desc: "A versão mais intensa de Born in Roma: especiarias envolventes e lavandim sobre um fundo de vetiver e madeira-de-guaiaco, pensada para a noite.",
          notes: { top: "mistura de especiarias, bergamota", heart: "lavandim", base: "vetiver, madeira-de-guaiaco" } }
      }
    },
    {
      id: "jpg-le-male-elixir",
      house: "Jean Paul Gaultier",
      name: "Le Male Elixir",
      badge: "Elixir",
      occasions: ["noche", "cita"],
      climates: ["frio"],
      ageMin: 25, ageMax: 45,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Oriental gourmand", desc: "Miel, benjuí, vainilla y tabaco. Envolvente y densa, perfecta para el invierno y las citas nocturnas.",
          notes: { top: "lavanda, menta, bergamota", heart: "benjuí, miel, haba tonka", base: "vainilla, tabaco, pachulí" } },
        en: { family: "Oriental gourmand", desc: "The sweetest side of Le Male: lavender and mint on opening, honey and benzoin at the heart, and a base of vanilla, tobacco and patchouli that lingers on skin for hours.",
          notes: { top: "lavender, mint, bergamot", heart: "benzoin, honey, tonka bean", base: "vanilla, tobacco, patchouli" } },
        pt: { family: "Oriental gourmand", desc: "O lado mais guloso de Le Male: lavanda e hortelã na abertura, mel e benjoim no coração, e uma base de baunilha, tabaco e pachuli que fica horas na pele.",
          notes: { top: "lavanda, hortelã, bergamota", heart: "benjoim, mel, fava-tonka", base: "baunilha, tabaco, pachuli" } }
      }
    },
    {
      id: "jpg-le-beau-le-parfum",
      house: "Jean Paul Gaultier",
      name: "Le Beau Le Parfum",
      badge: "Le Parfum",
      occasions: ["diario", "cita", "noche"],
      climates: ["calido"],
      ageMin: 18, ageMax: 40,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Gourmand tropical", desc: "Piña y jengibre dan paso a un corazón de coco que domina toda la fragancia, apoyado por sándalo, ámbar y haba tonka. Una versión más madura del Le Beau original.",
          notes: { top: "piña, iris, jengibre, ciprés", heart: "coco, notas amaderadas", base: "sándalo, haba tonka, ámbar" } },
        en: { family: "Tropical gourmand", desc: "Pineapple and ginger give way to a coconut heart that dominates the whole fragrance, backed by sandalwood, amber and tonka bean. A more mature take on the original Le Beau.",
          notes: { top: "pineapple, iris, ginger, cypress", heart: "coconut, woody notes", base: "sandalwood, tonka bean, amber" } },
        pt: { family: "Gourmand tropical", desc: "Ananás e gengibre dão lugar a um coração de coco que domina toda a fragrância, apoiado por sândalo, âmbar e fava-tonka. Uma versão mais madura do Le Beau original.",
          notes: { top: "ananás, íris, gengibre, cipreste", heart: "coco, notas amadeiradas", base: "sândalo, fava-tonka, âmbar" } }
      }
    },
    {
      id: "jpg-le-male-le-parfum",
      house: "Jean Paul Gaultier",
      name: "Le Male Le Parfum",
      badge: "Le Parfum",
      occasions: ["noche", "cita", "formal"],
      climates: ["frio", "templado"],
      ageMin: 22, ageMax: 45,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Oriental especiada", desc: "Cardamomo especiado, lavanda e iris se funden en una base de vainilla y madera. El equilibrio clásico de la línea Le Male, en una versión más densa.",
          notes: { top: "cardamomo", heart: "lavanda, iris", base: "vainilla, notas amaderadas" } },
        en: { family: "Spicy oriental", desc: "Spiced cardamom, lavender and iris melt into a base of vanilla and wood. The classic balance of the Le Male line, in a denser version.",
          notes: { top: "cardamom", heart: "lavender, iris", base: "vanilla, woody notes" } },
        pt: { family: "Oriental especiado", desc: "Cardamomo especiado, lavanda e íris fundem-se numa base de baunilha e madeira. O equilíbrio clássico da linha Le Male, numa versão mais densa.",
          notes: { top: "cardamomo", heart: "lavanda, íris", base: "baunilha, notas amadeiradas" } }
      }
    },
    {
      id: "mancera-cedrat-boise",
      house: "Mancera",
      name: "Cedrat Boise",
      badge: "EDP",
      occasions: ["diario", "oficina", "cita"],
      climates: ["calido", "templado"],
      ageMin: 22, ageMax: 45,
      budget: "medio",
      prices: { 3: 6990, 5: 11490, 10: 19990 },
      i18n: {
        es: { family: "Cítrica amaderada", desc: "Cítricos de Sicilia sobre cedro y cuero. Fresca de día, con carácter suficiente para la oficina o una cita.",
          notes: { top: "limón siciliano, bergamota, grosella negra", heart: "jazmín, pachulí", base: "cedro, cuero, sándalo, almizcle blanco" } },
        en: { family: "Citrus woody", desc: "Sicilian citrus over cedar and leather. Fresh by day, with enough character for the office or a date.",
          notes: { top: "Sicilian lemon, bergamot, blackcurrant", heart: "jasmine, patchouli", base: "cedar, leather, sandalwood, white musk" } },
        pt: { family: "Cítrica amadeirada", desc: "Citrinos da Sicília sobre cedro e couro. Fresca de dia, com carácter suficiente para o escritório ou um encontro.",
          notes: { top: "limão-siciliano, bergamota, groselha-preta", heart: "jasmim, pachuli", base: "cedro, couro, sândalo, almíscar-branco" } }
      }
    },
    {
      id: "mykonos-inception",
      house: "Mykonos",
      name: "Inception",
      badge: "EDP",
      occasions: ["diario", "cita"],
      climates: ["calido"],
      ageMin: 18, ageMax: 30,
      budget: "accesible",
      prices: { 3: 3990, 5: 5990, 10: 8990 },
      i18n: {
        es: { family: "Floral acuática", desc: "Naranja, té negro y almizcle. Ligera, luminosa y fácil de llevar en climas cálidos.",
          notes: { top: "naranja, bergamota, jengibre, limón", heart: "té negro, canela, neroli", base: "almizcle, cedro, madera de guayaco" } },
        en: { family: "Floral aquatic", desc: "Orange, ginger and black tea over a base of cedar and musk. A bright, easy-to-wear fragrance, built for warm weather.",
          notes: { top: "orange, bergamot, ginger, lemon", heart: "black tea, cinnamon, neroli", base: "musk, cedar, guaiac wood" } },
        pt: { family: "Floral aquática", desc: "Laranja, gengibre e chá-preto sobre um fundo de cedro e almíscar. Uma fragrância luminosa e fácil de usar, pensada para climas quentes.",
          notes: { top: "laranja, bergamota, gengibre, limão", heart: "chá-preto, canela, neróli", base: "almíscar, cedro, madeira-de-guaiaco" } }
      }
    },
    {
      id: "azzaro-most-wanted-intense",
      house: "Azzaro",
      name: "The Most Wanted Intense",
      badge: "EDP Intense",
      occasions: ["diario", "noche", "cita"],
      climates: ["templado", "frio"],
      ageMin: 18, ageMax: 35,
      budget: "medio",
      prices: { 3: 7490, 5: 11990, 10: 20990 },
      i18n: {
        es: { family: "Amaderada gourmand", desc: "Cardamomo especiado que da paso a un corazón de toffee casi comestible, sobre una base de ámbar amaderado. Dulce, pero sin resultar empalagosa.",
          notes: { top: "cardamomo", heart: "toffee", base: "ámbar amaderado" } },
        en: { family: "Woody gourmand", desc: "Spiced cardamom gives way to an almost edible toffee heart, over a base of woody amber. Sweet, without turning cloying.",
          notes: { top: "cardamom", heart: "toffee", base: "woody amber" } },
        pt: { family: "Amadeirada gourmand", desc: "Cardamomo especiado que dá lugar a um coração de caramelo quase comestível, sobre uma base de âmbar amadeirado. Doce, sem se tornar enjoativa.",
          notes: { top: "cardamomo", heart: "caramelo", base: "âmbar-amadeirado" } }
      }
    },
    {
      id: "french-avenue-liquid-brun",
      house: "French Avenue",
      name: "Liquid Brun",
      badge: "EDP",
      occasions: ["noche", "cita"],
      climates: ["frio"],
      ageMin: 20, ageMax: 45,
      budget: "accesible",
      prices: { 3: 3990, 5: 5990, 10: 8990 },
      i18n: {
        es: { family: "Oriental especiada", desc: "Canela y cardamomo se encuentran con vainilla bourbon y praliné, sobre una base de ámbar y madera de guayaco. Cálida, dulce y de larga duración.",
          notes: { top: "canela, cardamomo, bergamota, azahar", heart: "vainilla bourbon, elemí", base: "praliné, almizcle, ambroxán, madera de guayaco" } },
        en: { family: "Spicy oriental", desc: "Cinnamon and cardamom meet bourbon vanilla and praline, over a base of amber and guaiac wood. Warm, sweet and long-lasting.",
          notes: { top: "cinnamon, cardamom, bergamot, orange blossom", heart: "bourbon vanilla, elemi", base: "praline, musk, ambroxan, guaiac wood" } },
        pt: { family: "Oriental especiado", desc: "Canela e cardamomo encontram-se com baunilha bourbon e praliné, sobre uma base de âmbar e madeira-de-guaiaco. Quente, doce e de longa duração.",
          notes: { top: "canela, cardamomo, bergamota, flor-de-laranjeira", heart: "baunilha bourbon, elemi", base: "praliné, almíscar, ambroxan, madeira-de-guaiaco" } }
      }
    }
  ];

  var BUDGET_ORDER = ["accesible", "medio", "alto"];

  function formatCLP(n) {
    return "$" + n.toLocaleString("es-CL");
  }

  /* ---------------------------------------------------------------------
     Idioma: español (por defecto) / inglés / portugués
     ---------------------------------------------------------------------
     I18N guarda TODO el texto de la interfaz (no el de cada perfume, que
     vive en PERFUMES[].i18n). Las claves son las mismas que aparecen en
     el HTML como data-i18n="clave" / data-i18n-aria="clave" /
     data-i18n-alt="clave", así que applyLanguage() no necesita mapear
     nada aparte: recorre esos atributos y busca la clave tal cual.
     La elección de idioma se recuerda entre páginas (ver sección 12);
     sin una elección guardada, el sitio arranca en español.
  */
  var currentLang = "es";

  var I18N = {
    es: {
      skipLink: "Saltar al catálogo",
      "advisor.recommend": "Recomendador IA", "advisor.chat": "Chat", "advisor.compare": "Comparador",
      "nav.inicio": "Inicio", "nav.recomendador": "Recomendador", "nav.coleccion": "Colección",
      "nav.comprar": "Comprar", "nav.informacion": "Información", "nav.contacto": "Contacto",
      navToggleOpen: "Abrir menú", navToggleClose: "Cerrar menú",
      "hero.h1": "UPerfumes — fragancias que dejan huella",
      "hero.imgAlt": "UPerfumes, fragancias que dejan huella. Frascos de Dior Homme Intense y Valentino Uomo sobre mármol oscuro con acentos dorados.",
      "hero.sub": "Una colección curada de eaus de parfum, elixires y extraits de alta concentración — de casas como Dior y Jean Paul Gaultier a firmas nicho como Mancera y Mykonos.",
      "hero.cta": "Ver la colección",
      scrollCue: "Bajar al catálogo",
      "finder.title": "Encuentra tu fragancia",
      "finder.subtitle": "Responde estas cuatro preguntas y te sugerimos la fragancia del catálogo que mejor encaja contigo.",
      "finder.occasion.label": "Ocasión", "finder.occasion.diario": "Diario", "finder.occasion.oficina": "Oficina",
      "finder.occasion.noche": "Noche", "finder.occasion.cita": "Cita", "finder.occasion.formal": "Evento formal",
      "finder.climate.label": "Clima", "finder.climate.calido": "Cálido", "finder.climate.frio": "Frío", "finder.climate.templado": "Templado / todo el año",
      "finder.age.label": "Edad", "finder.age.plus46": "46+",
      "finder.budget.label": "Presupuesto", "finder.budget.accesible": "Accesible", "finder.budget.medio": "Gama media",
      "finder.budget.alto": "Alta gama", "finder.budget.cualquiera": "Sin preferencia",
      "finder.submit": "Ver mi recomendación", "finder.reset": "Volver a empezar",
      "finder.hintIncomplete": "Elige una opción en cada pregunta para activar el botón.",
      "finder.hintComplete": "Todo listo. Pulsa el botón para ver tu recomendación.",
      "finder.resultLead": "Según lo que elegiste, esta es tu mejor opción del catálogo — con dos alternativas más por si quieres comparar.",
      "finder.top": "Tu mejor opción", "finder.alsoLike": "También te podría interesar",
      "finder.matchPrefix": "Coincide en ",
      "finder.matchNone": "Una alternativa dentro del catálogo, aunque no coincide en todos tus criterios.",
      "finder.matched.occasion.diario": "diario", "finder.matched.occasion.oficina": "oficina", "finder.matched.occasion.noche": "noche",
      "finder.matched.occasion.cita": "cita", "finder.matched.occasion.formal": "evento formal",
      "finder.matched.climate.calido": "clima cálido", "finder.matched.climate.frio": "clima frío", "finder.matched.climate.templado": "clima templado",
      "finder.matched.age.18-25": "18–25 años", "finder.matched.age.26-35": "26–35 años", "finder.matched.age.36-45": "36–45 años", "finder.matched.age.46-99": "46+ años",
      "finder.matched.budget.accesible": "presupuesto accesible", "finder.matched.budget.medio": "presupuesto medio",
      "finder.matched.budget.alto": "presupuesto alto", "finder.matched.budget.cualquiera": "sin preferencia de presupuesto",
      "stats.ariaLabel": "La colección en cifras", "stats.fragrances": "fragancias en catálogo",
      "stats.houses": "casas de perfumería", "stats.families": "familias olfativas",
      "collection.title": "La colección",
      "collection.subtitle": "Once fragancias masculinas de alta concentración. Filtra por familia olfativa para encontrar el perfil que buscas.",
      "collection.filterAriaLabel": "Filtrar por familia olfativa",
      "collection.filters.todos": "Todos", "collection.filters.citrico": "Cítrico", "collection.filters.aromatico": "Aromático",
      "collection.filters.amaderado": "Amaderado", "collection.filters.floral": "Floral", "collection.filters.oriental": "Oriental", "collection.filters.gourmand": "Gourmand",
      "collection.decantsLabel": "Decants disponibles",
      "collection.imgPlaceholder": "Coloca aquí la imagen",
      "collection.imgSize": "800 × 1000\u00A0px sugerido",
      "collection.filtersEmpty": "No hay fragancias en esta familia todavía.",
      "collection.notesTop": "Salida", "collection.notesHeart": "Corazón", "collection.notesBase": "Fondo",
      "buy.title": "Comprar un decant",
      "buy.subtitle": "Elige el formato desde la colección — al hacer clic, aparece aquí para que lo agregues al carrito o lo compres ahora.",
      "buy.empty": "Todavía no elegiste un decant. Ve a la <a href=\"#coleccion\">colección</a> y haz clic en el formato que quieras (3, 5 o 10\u00A0ml).",
      "buy.step1": "1. Elige el formato", "buy.formatAriaLabel": "Formato",
      "buy.summaryPrefix": "Tu decant: ",
      "info.title": "Información", "info.subtitle": "Medios de pago y despacho para tus decants.",
      "info.paymentTitle": "Medios de pago", "info.shippingTitle": "Envíos",
      "info.shippingText": "Hacemos despacho a todo Chile a través de Starken. El costo y el tiempo de entrega dependen de tu comuna; te los confirmamos al coordinar el pedido.",
      "info.note": "¿Quieres hacer un pedido? Escríbenos desde la sección <a href=\"#contacto\">Contacto</a>.",
      "contact.title": "Contacto",
      "contact.subtitle": "¿Buscas una fragancia en particular o quieres más información sobre alguna casa del catálogo? Escríbenos.",
      "contact.email": "Correo", "contact.instagram": "Instagram",
      "footer.disclaimer": "© 2026 UPerfumes. Todas las marcas y nombres de fragancias mencionados pertenecen a sus respectivos propietarios. UPerfumes no está afiliado a dichas casas de perfumería.",
      "hub.ariaLabel": "Navegación rápida y modo de color", "hub.navAriaLabel": "Ir a sección",
      "hub.ariaLabelLite": "Modo de color e idioma",
      themeToggleLight: "Cambiar a modo claro", themeToggleDark: "Cambiar a modo oscuro",
      pageTitle: "UPerfumes — Fragancias de alta concentración",
      metaDescription: "UPerfumes: catálogo curado de eaus de parfum, elixires y extraits de alta concentración. Dior, Jean Paul Gaultier, Valentino, Paco Rabanne, Azzaro, Mancera y más.",
      bottleAlt: "Frasco de ",
      orderPageTitle: "Confirmar pedido — UPerfumes",
      orderPageDesc: "Confirma tu pedido de decant: formato, correo, método de pago y dirección de entrega.",
      "order.back": "Volver a la colección",
      "order.h1": "Confirmar pedido",
      "order.intro": "Revisa el decant elegido y completa tus datos. Si pagas con tarjeta, te llevamos al formulario seguro de Webpay; si prefieres transferencia, te mostramos los datos al confirmar.",
      "order.empty": "No encontramos ningún decant seleccionado. Vuelve a la <a href=\"index.html#coleccion\">colección</a> y elige un formato para empezar tu pedido.",
      "order.name.label": "Nombre completo", "order.name.placeholder": "Tu nombre",
      "order.email.label": "Correo electrónico", "order.email.placeholder": "tu@correo.com",
      "order.email.hint": "Lo usamos para confirmarte el pedido y coordinar el pago.",
      "order.payment.label": "Método de pago",
      "order.payment.transfer.label": "Transferencia a Cuenta RUT",
      "order.payment.transfer.desc": "Te enviamos el número de cuenta al confirmar.",
      "order.payment.card.label": "Tarjeta de crédito o débito (Webpay)",
      "order.payment.card.desc": "Pagas ahora en el formulario seguro de Transbank.",
      "order.address.label": "Dirección de entrega", "order.address.placeholder": "Calle, número, comuna y región",
      "order.address.hint": "El despacho se hace a todo Chile mediante Starken.",
      "order.notes.label": "Notas para el pedido (opcional)", "order.notes.placeholder": "Referencias de despacho, horario, etc.",
      "order.submit": "Confirmar pedido",
      "order.submitting": "Enviando…",
      "order.error.generic": "No pudimos procesar tu pedido. Intenta de nuevo.",
      "order.error.network": "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
      "order.result.title": "¡Pedido recibido!",
      "order.result.transferIntro": "Tu número de pedido es",
      "order.result.transferInstructions": "Transfiere el monto a estos datos y envíanos el comprobante a hola@uperfumes.com para coordinar el envío.",
      "order.result.bank": "Banco", "order.result.accountType": "Tipo de cuenta",
      "order.result.accountNumber": "Número de cuenta", "order.result.holder": "Titular",
      "order.result.rut": "RUT", "order.result.email": "Correo",
      "order.result.backToCatalog": "Volver al catálogo",
      "order.result.amount": "Monto a transferir",
      "order.submit.webpay": "Pagar con Webpay",
      "order.error.empty": "No hay productos en tu pedido.",
      "buy.addToCart": "Agregar al carrito", "buy.buyNow": "Comprar ahora",
      "cart.title": "Tu carrito", "cart.open": "Abrir carrito", "cart.close": "Cerrar carrito",
      "cart.empty": "Tu carrito está vacío.", "cart.emptyCta": "Ver la colección",
      "cart.subtotal": "Subtotal", "cart.total": "Total", "cart.goToCart": "Ir a carrito",
      "cart.remove": "Quitar", "cart.each": "c/u", "cart.qty": "Cantidad",
      "cart.inc": "Aumentar cantidad", "cart.dec": "Disminuir cantidad",
      "product.format": "Elige el formato",
      "product.notFound": "No encontramos esta fragancia. Vuelve a la <a href=\"index.html#coleccion\">colección</a> para elegir otra.",
      "cartpage.pageTitle": "Carrito — UPerfumes",
      "cartpage.pageDesc": "Revisa tu carrito y paga con Webpay en UPerfumes.",
      "cartpage.continue": "Seguir comprando",
      "cartpage.intro": "Revisa tus decants, ajusta las cantidades y paga con tarjeta mediante Webpay o por transferencia.",
      "cartpage.checkoutTitle": "Tus datos y pago",
      "cartpage.secure": "El pago con tarjeta se hace en el sitio seguro de Transbank: nosotros nunca vemos los datos de tu tarjeta.",
      "confirm.pageTitle": "Confirmación de pago — UPerfumes",
      "confirm.pageDesc": "Resultado de tu pago con Webpay en UPerfumes.",
      "confirm.loading": "Verificando el resultado de tu pago…",
      "confirm.approved.title": "¡Pago aprobado!",
      "confirm.approved.text": "Tu pedido quedó confirmado. Te escribimos a tu correo para coordinar el envío por Starken.",
      "confirm.order": "Pedido", "confirm.items": "Detalle", "confirm.amount": "Monto pagado",
      "confirm.authCode": "Código de autorización", "confirm.card": "Tarjeta",
      "confirm.rejected.title": "Pago rechazado",
      "confirm.rejected.text": "Tu banco rechazó el pago. No se te realizó ningún cobro — puedes intentar de nuevo o elegir transferencia.",
      "confirm.cancelled.title": "Pago cancelado",
      "confirm.cancelled.text": "Volviste sin terminar de pagar. No se te realizó ningún cobro — puedes intentarlo de nuevo cuando quieras.",
      "confirm.error.title": "No pudimos confirmar el pago",
      "confirm.error.text": "Algo falló al verificar el resultado. Si alcanzaste a pagar, escríbenos a hola@uperfumes.com con la hora aproximada para revisarlo."
    },
    en: {
      skipLink: "Skip to catalog",
      "advisor.recommend": "AI finder", "advisor.chat": "Chat", "advisor.compare": "Compare",
      "nav.inicio": "Home", "nav.recomendador": "Finder", "nav.coleccion": "Collection",
      "nav.comprar": "Buy", "nav.informacion": "Info", "nav.contacto": "Contact",
      navToggleOpen: "Open menu", navToggleClose: "Close menu",
      "hero.h1": "UPerfumes — fragrances that leave a mark",
      "hero.imgAlt": "UPerfumes, fragrances that leave a mark. Bottles of Dior Homme Intense and Valentino Uomo on dark marble with gold accents.",
      "hero.sub": "A curated collection of high-concentration eaux de parfum, elixirs and extraits — from houses like Dior and Jean Paul Gaultier to niche names like Mancera and Mykonos.",
      "hero.cta": "View the collection",
      scrollCue: "Scroll to catalog",
      "finder.title": "Find your fragrance",
      "finder.subtitle": "Answer these four questions and we'll suggest the fragrance in the catalog that fits you best.",
      "finder.occasion.label": "Occasion", "finder.occasion.diario": "Everyday", "finder.occasion.oficina": "Office",
      "finder.occasion.noche": "Evening", "finder.occasion.cita": "Date", "finder.occasion.formal": "Formal event",
      "finder.climate.label": "Climate", "finder.climate.calido": "Warm", "finder.climate.frio": "Cold", "finder.climate.templado": "Mild / year-round",
      "finder.age.label": "Age", "finder.age.plus46": "46+",
      "finder.budget.label": "Budget", "finder.budget.accesible": "Budget-friendly", "finder.budget.medio": "Mid-range",
      "finder.budget.alto": "High-end", "finder.budget.cualquiera": "No preference",
      "finder.submit": "See my recommendation", "finder.reset": "Start over",
      "finder.hintIncomplete": "Choose an option in each question to enable the button.",
      "finder.hintComplete": "All set. Tap the button to see your recommendation.",
      "finder.resultLead": "Based on what you chose, here's your best match in the catalog — plus two alternatives to compare.",
      "finder.top": "Your best match", "finder.alsoLike": "You might also like",
      "finder.matchPrefix": "Matches ",
      "finder.matchNone": "An alternative from the catalog, though it doesn't match all your criteria.",
      "finder.matched.occasion.diario": "everyday wear", "finder.matched.occasion.oficina": "office wear", "finder.matched.occasion.noche": "evening wear",
      "finder.matched.occasion.cita": "a date", "finder.matched.occasion.formal": "formal events",
      "finder.matched.climate.calido": "warm weather", "finder.matched.climate.frio": "cold weather", "finder.matched.climate.templado": "mild weather",
      "finder.matched.age.18-25": "18–25 years old", "finder.matched.age.26-35": "26–35 years old", "finder.matched.age.36-45": "36–45 years old", "finder.matched.age.46-99": "46+ years old",
      "finder.matched.budget.accesible": "budget-friendly price", "finder.matched.budget.medio": "mid-range price",
      "finder.matched.budget.alto": "high-end price", "finder.matched.budget.cualquiera": "no budget preference",
      "stats.ariaLabel": "The collection in numbers", "stats.fragrances": "fragrances in the catalog",
      "stats.houses": "perfume houses", "stats.families": "olfactory families",
      "collection.title": "The collection",
      "collection.subtitle": "Eleven high-concentration masculine fragrances. Filter by olfactory family to find the profile you're after.",
      "collection.filterAriaLabel": "Filter by olfactory family",
      "collection.filters.todos": "All", "collection.filters.citrico": "Citrus", "collection.filters.aromatico": "Aromatic",
      "collection.filters.amaderado": "Woody", "collection.filters.floral": "Floral", "collection.filters.oriental": "Oriental", "collection.filters.gourmand": "Gourmand",
      "collection.decantsLabel": "Decants available",
      "collection.imgPlaceholder": "Place the image here",
      "collection.imgSize": "800 × 1000\u00A0px suggested",
      "collection.filtersEmpty": "No fragrances in this family yet.",
      "collection.notesTop": "Top", "collection.notesHeart": "Heart", "collection.notesBase": "Base",
      "buy.title": "Buy a decant",
      "buy.subtitle": "Choose a format from the collection — clicking one brings it here so you can add it to your cart or buy it now.",
      "buy.empty": "You haven't picked a decant yet. Go to the <a href=\"#coleccion\">collection</a> and click the format you want (3, 5 or 10\u00A0ml).",
      "buy.step1": "1. Choose the format", "buy.formatAriaLabel": "Format",
      "buy.summaryPrefix": "Your decant: ",
      "info.title": "Info", "info.subtitle": "Payment methods and shipping for your decants.",
      "info.paymentTitle": "Payment methods", "info.shippingTitle": "Shipping",
      "info.shippingText": "We ship anywhere in Chile via Starken. Cost and delivery time depend on your comuna; we confirm both when we coordinate your order.",
      "info.note": "Want to place an order? Write to us from the <a href=\"#contacto\">Contact</a> section.",
      "contact.title": "Contact",
      "contact.subtitle": "Looking for a specific fragrance, or want more information about a house in the catalog? Write to us.",
      "contact.email": "Email", "contact.instagram": "Instagram",
      "footer.disclaimer": "© 2026 UPerfumes. All brand and fragrance names mentioned belong to their respective owners. UPerfumes is not affiliated with those perfume houses.",
      "hub.ariaLabel": "Quick navigation and colour mode", "hub.navAriaLabel": "Jump to section",
      "hub.ariaLabelLite": "Colour mode and language",
      themeToggleLight: "Switch to light mode", themeToggleDark: "Switch to dark mode",
      pageTitle: "UPerfumes — High-concentration fragrances",
      metaDescription: "UPerfumes: a curated catalog of high-concentration eaux de parfum, elixirs and extraits. Dior, Jean Paul Gaultier, Valentino, Paco Rabanne, Azzaro, Mancera and more.",
      bottleAlt: "Bottle of ",
      orderPageTitle: "Confirm order — UPerfumes",
      orderPageDesc: "Confirm your decant order: format, email, payment method and delivery address.",
      "order.back": "Back to the collection",
      "order.h1": "Confirm order",
      "order.intro": "Review the decant you chose and fill in your details. Paying by card takes you to the secure Webpay form; choosing bank transfer shows you the details once you confirm.",
      "order.empty": "We couldn't find a selected decant. Go back to the <a href=\"index.html#coleccion\">collection</a> and pick a format to start your order.",
      "order.name.label": "Full name", "order.name.placeholder": "Your name",
      "order.email.label": "Email address", "order.email.placeholder": "you@email.com",
      "order.email.hint": "We use this to confirm your order and arrange payment.",
      "order.payment.label": "Payment method",
      "order.payment.transfer.label": "Bank transfer (Cuenta RUT)",
      "order.payment.transfer.desc": "We'll send you the account number when we confirm.",
      "order.payment.card.label": "Credit or debit card (Webpay)",
      "order.payment.card.desc": "You pay now on Transbank's secure form.",
      "order.address.label": "Delivery address", "order.address.placeholder": "Street, number, comuna and region",
      "order.address.hint": "We ship anywhere in Chile via Starken.",
      "order.notes.label": "Notes for the order (optional)", "order.notes.placeholder": "Delivery references, timing, etc.",
      "order.submit": "Confirm order",
      "order.submitting": "Sending…",
      "order.error.generic": "We couldn't process your order. Please try again.",
      "order.error.network": "We couldn't reach the server. Check your connection and try again.",
      "order.result.title": "Order received!",
      "order.result.transferIntro": "Your order number is",
      "order.result.transferInstructions": "Transfer the amount to these details and send us the receipt at hola@uperfumes.com to arrange shipping.",
      "order.result.bank": "Bank", "order.result.accountType": "Account type",
      "order.result.accountNumber": "Account number", "order.result.holder": "Account holder",
      "order.result.rut": "Tax ID (RUT)", "order.result.email": "Email",
      "order.result.backToCatalog": "Back to the collection",
      "order.result.amount": "Amount to transfer",
      "order.submit.webpay": "Pay with Webpay",
      "order.error.empty": "There are no products in your order.",
      "buy.addToCart": "Add to cart", "buy.buyNow": "Buy now",
      "cart.title": "Your cart", "cart.open": "Open cart", "cart.close": "Close cart",
      "cart.empty": "Your cart is empty.", "cart.emptyCta": "View the collection",
      "cart.subtotal": "Subtotal", "cart.total": "Total", "cart.goToCart": "Go to cart",
      "cart.remove": "Remove", "cart.each": "each", "cart.qty": "Quantity",
      "cart.inc": "Increase quantity", "cart.dec": "Decrease quantity",
      "product.format": "Choose a format",
      "product.notFound": "We couldn't find this fragrance. Go back to the <a href=\"index.html#coleccion\">collection</a> to pick another.",
      "cartpage.pageTitle": "Cart — UPerfumes",
      "cartpage.pageDesc": "Review your cart and pay with Webpay at UPerfumes.",
      "cartpage.continue": "Keep shopping",
      "cartpage.intro": "Review your decants, adjust quantities and pay by card through Webpay or by bank transfer.",
      "cartpage.checkoutTitle": "Your details and payment",
      "cartpage.secure": "Card payments happen on Transbank's secure site: we never see your card details.",
      "confirm.pageTitle": "Payment confirmation — UPerfumes",
      "confirm.pageDesc": "Result of your Webpay payment at UPerfumes.",
      "confirm.loading": "Checking your payment result…",
      "confirm.approved.title": "Payment approved!",
      "confirm.approved.text": "Your order is confirmed. We'll email you to arrange Starken shipping.",
      "confirm.order": "Order", "confirm.items": "Details", "confirm.amount": "Amount paid",
      "confirm.authCode": "Authorization code", "confirm.card": "Card",
      "confirm.rejected.title": "Payment declined",
      "confirm.rejected.text": "Your bank declined the payment. You were not charged — you can try again or choose bank transfer.",
      "confirm.cancelled.title": "Payment cancelled",
      "confirm.cancelled.text": "You came back without finishing payment. You were not charged — you can try again anytime.",
      "confirm.error.title": "We couldn't confirm the payment",
      "confirm.error.text": "Something failed while checking the result. If you did pay, write to us at hola@uperfumes.com with the approximate time so we can check it."
    },
    pt: {
      skipLink: "Saltar para o catálogo",
      "advisor.recommend": "Recomendador IA", "advisor.chat": "Chat", "advisor.compare": "Comparador",
      "nav.inicio": "Início", "nav.recomendador": "Recomendador", "nav.coleccion": "Coleção",
      "nav.comprar": "Comprar", "nav.informacion": "Informação", "nav.contacto": "Contacto",
      navToggleOpen: "Abrir menu", navToggleClose: "Fechar menu",
      "hero.h1": "UPerfumes — fragrâncias que deixam marca",
      "hero.imgAlt": "UPerfumes, fragrâncias que deixam marca. Frascos de Dior Homme Intense e Valentino Uomo sobre mármore escuro com acentos dourados.",
      "hero.sub": "Uma coleção com curadoria de eaux de parfum, elixires e extraits de alta concentração — de casas como Dior e Jean Paul Gaultier a marcas nicho como Mancera e Mykonos.",
      "hero.cta": "Ver a coleção",
      scrollCue: "Descer para o catálogo",
      "finder.title": "Encontra a tua fragrância",
      "finder.subtitle": "Responde a estas quatro perguntas e sugerimos-te a fragrância do catálogo que melhor combina contigo.",
      "finder.occasion.label": "Ocasião", "finder.occasion.diario": "Diário", "finder.occasion.oficina": "Escritório",
      "finder.occasion.noche": "Noite", "finder.occasion.cita": "Encontro", "finder.occasion.formal": "Evento formal",
      "finder.climate.label": "Clima", "finder.climate.calido": "Quente", "finder.climate.frio": "Frio", "finder.climate.templado": "Ameno / todo o ano",
      "finder.age.label": "Idade", "finder.age.plus46": "46+",
      "finder.budget.label": "Orçamento", "finder.budget.accesible": "Acessível", "finder.budget.medio": "Gama média",
      "finder.budget.alto": "Gama alta", "finder.budget.cualquiera": "Sem preferência",
      "finder.submit": "Ver a minha recomendação", "finder.reset": "Recomeçar",
      "finder.hintIncomplete": "Escolhe uma opção em cada pergunta para ativar o botão.",
      "finder.hintComplete": "Tudo pronto. Carrega no botão para ver a tua recomendação.",
      "finder.resultLead": "Com base no que escolheste, esta é a tua melhor opção do catálogo — com mais duas alternativas para comparares.",
      "finder.top": "A tua melhor opção", "finder.alsoLike": "Também te pode interessar",
      "finder.matchPrefix": "Coincide em ",
      "finder.matchNone": "Uma alternativa dentro do catálogo, ainda que não coincida com todos os teus critérios.",
      "finder.matched.occasion.diario": "uso diário", "finder.matched.occasion.oficina": "escritório", "finder.matched.occasion.noche": "noite",
      "finder.matched.occasion.cita": "um encontro", "finder.matched.occasion.formal": "eventos formais",
      "finder.matched.climate.calido": "clima quente", "finder.matched.climate.frio": "clima frio", "finder.matched.climate.templado": "clima ameno",
      "finder.matched.age.18-25": "18–25 anos", "finder.matched.age.26-35": "26–35 anos", "finder.matched.age.36-45": "36–45 anos", "finder.matched.age.46-99": "46+ anos",
      "finder.matched.budget.accesible": "orçamento acessível", "finder.matched.budget.medio": "orçamento médio",
      "finder.matched.budget.alto": "orçamento alto", "finder.matched.budget.cualquiera": "sem preferência de orçamento",
      "stats.ariaLabel": "A coleção em números", "stats.fragrances": "fragrâncias no catálogo",
      "stats.houses": "casas de perfumaria", "stats.families": "famílias olfativas",
      "collection.title": "A coleção",
      "collection.subtitle": "Onze fragrâncias masculinas de alta concentração. Filtra por família olfativa para encontrar o perfil que procuras.",
      "collection.filterAriaLabel": "Filtrar por família olfativa",
      "collection.filters.todos": "Todas", "collection.filters.citrico": "Cítrica", "collection.filters.aromatico": "Aromática",
      "collection.filters.amaderado": "Amadeirada", "collection.filters.floral": "Floral", "collection.filters.oriental": "Oriental", "collection.filters.gourmand": "Gourmand",
      "collection.decantsLabel": "Decants disponíveis",
      "collection.imgPlaceholder": "Coloca aqui a imagem",
      "collection.imgSize": "800 × 1000\u00A0px sugerido",
      "collection.filtersEmpty": "Ainda não há fragrâncias nesta família.",
      "collection.notesTop": "Saída", "collection.notesHeart": "Coração", "collection.notesBase": "Fundo",
      "buy.title": "Comprar um decant",
      "buy.subtitle": "Escolhe o formato a partir da coleção — ao clicares, aparece aqui para o adicionares ao carrinho ou comprares já.",
      "buy.empty": "Ainda não escolheste um decant. Vai à <a href=\"#coleccion\">coleção</a> e clica no formato que queres (3, 5 ou 10\u00A0ml).",
      "buy.step1": "1. Escolhe o formato", "buy.formatAriaLabel": "Formato",
      "buy.summaryPrefix": "O teu decant: ",
      "info.title": "Informação", "info.subtitle": "Meios de pagamento e envio para os teus decants.",
      "info.paymentTitle": "Meios de pagamento", "info.shippingTitle": "Envios",
      "info.shippingText": "Fazemos envios para todo o Chile através da Starken. O custo e o prazo de entrega dependem da tua comuna; confirmamo-los ao combinar o pedido.",
      "info.note": "Queres fazer um pedido? Escreve-nos a partir da secção <a href=\"#contacto\">Contacto</a>.",
      "contact.title": "Contacto",
      "contact.subtitle": "Procuras uma fragrância em particular ou queres mais informação sobre alguma casa do catálogo? Escreve-nos.",
      "contact.email": "E-mail", "contact.instagram": "Instagram",
      "footer.disclaimer": "© 2026 UPerfumes. Todas as marcas e nomes de fragrâncias mencionados pertencem aos respetivos proprietários. A UPerfumes não está afiliada a essas casas de perfumaria.",
      "hub.ariaLabel": "Navegação rápida e modo de cor", "hub.navAriaLabel": "Ir para secção",
      "hub.ariaLabelLite": "Modo de cor e idioma",
      themeToggleLight: "Mudar para modo claro", themeToggleDark: "Mudar para modo escuro",
      pageTitle: "UPerfumes — Fragrâncias de alta concentração",
      metaDescription: "UPerfumes: catálogo com curadoria de eaux de parfum, elixires e extraits de alta concentração. Dior, Jean Paul Gaultier, Valentino, Paco Rabanne, Azzaro, Mancera e mais.",
      bottleAlt: "Frasco de ",
      orderPageTitle: "Confirmar pedido — UPerfumes",
      orderPageDesc: "Confirma o teu pedido de decant: formato, e-mail, método de pagamento e morada de entrega.",
      "order.back": "Voltar à coleção",
      "order.h1": "Confirmar pedido",
      "order.intro": "Revê o decant escolhido e preenche os teus dados. Se pagares com cartão, levamos-te ao formulário seguro da Webpay; se preferires transferência, mostramos-te os dados ao confirmares.",
      "order.empty": "Não encontrámos nenhum decant selecionado. Volta à <a href=\"index.html#coleccion\">coleção</a> e escolhe um formato para começares o teu pedido.",
      "order.name.label": "Nome completo", "order.name.placeholder": "O teu nome",
      "order.email.label": "E-mail", "order.email.placeholder": "teu@email.com",
      "order.email.hint": "Usamos isto para confirmar o teu pedido e combinar o pagamento.",
      "order.payment.label": "Método de pagamento",
      "order.payment.transfer.label": "Transferência para Cuenta RUT",
      "order.payment.transfer.desc": "Enviamos-te o número da conta ao confirmar.",
      "order.payment.card.label": "Cartão de crédito ou débito (Webpay)",
      "order.payment.card.desc": "Pagas agora no formulário seguro da Transbank.",
      "order.address.label": "Morada de entrega", "order.address.placeholder": "Rua, número, comuna e região",
      "order.address.hint": "Fazemos envios para todo o Chile através da Starken.",
      "order.notes.label": "Notas para o pedido (opcional)", "order.notes.placeholder": "Referências de entrega, horário, etc.",
      "order.submit": "Confirmar pedido",
      "order.submitting": "A enviar…",
      "order.error.generic": "Não conseguimos processar o teu pedido. Tenta novamente.",
      "order.error.network": "Não conseguimos ligar ao servidor. Verifica a tua ligação e tenta novamente.",
      "order.result.title": "Pedido recebido!",
      "order.result.transferIntro": "O teu número de pedido é",
      "order.result.transferInstructions": "Transfere o valor para estes dados e envia-nos o comprovativo para hola@uperfumes.com para combinarmos o envio.",
      "order.result.bank": "Banco", "order.result.accountType": "Tipo de conta",
      "order.result.accountNumber": "Número de conta", "order.result.holder": "Titular",
      "order.result.rut": "RUT", "order.result.email": "E-mail",
      "order.result.backToCatalog": "Voltar à coleção",
      "order.result.amount": "Valor a transferir",
      "order.submit.webpay": "Pagar com Webpay",
      "order.error.empty": "Não há produtos no teu pedido.",
      "buy.addToCart": "Adicionar ao carrinho", "buy.buyNow": "Comprar agora",
      "cart.title": "O teu carrinho", "cart.open": "Abrir carrinho", "cart.close": "Fechar carrinho",
      "cart.empty": "O teu carrinho está vazio.", "cart.emptyCta": "Ver a coleção",
      "cart.subtotal": "Subtotal", "cart.total": "Total", "cart.goToCart": "Ir para o carrinho",
      "cart.remove": "Remover", "cart.each": "cada", "cart.qty": "Quantidade",
      "cart.inc": "Aumentar quantidade", "cart.dec": "Diminuir quantidade",
      "product.format": "Escolhe o formato",
      "product.notFound": "Não encontrámos esta fragrância. Volta à <a href=\"index.html#coleccion\">coleção</a> para escolher outra.",
      "cartpage.pageTitle": "Carrinho — UPerfumes",
      "cartpage.pageDesc": "Revê o teu carrinho e paga com Webpay na UPerfumes.",
      "cartpage.continue": "Continuar a comprar",
      "cartpage.intro": "Revê os teus decants, ajusta as quantidades e paga com cartão através da Webpay ou por transferência.",
      "cartpage.checkoutTitle": "Os teus dados e pagamento",
      "cartpage.secure": "O pagamento com cartão faz-se no site seguro da Transbank: nunca vemos os dados do teu cartão.",
      "confirm.pageTitle": "Confirmação de pagamento — UPerfumes",
      "confirm.pageDesc": "Resultado do teu pagamento com Webpay na UPerfumes.",
      "confirm.loading": "A verificar o resultado do teu pagamento…",
      "confirm.approved.title": "Pagamento aprovado!",
      "confirm.approved.text": "O teu pedido ficou confirmado. Vamos escrever-te para o teu e-mail para combinar o envio pela Starken.",
      "confirm.order": "Pedido", "confirm.items": "Detalhe", "confirm.amount": "Valor pago",
      "confirm.authCode": "Código de autorização", "confirm.card": "Cartão",
      "confirm.rejected.title": "Pagamento recusado",
      "confirm.rejected.text": "O teu banco recusou o pagamento. Não houve nenhuma cobrança — podes tentar novamente ou escolher transferência.",
      "confirm.cancelled.title": "Pagamento cancelado",
      "confirm.cancelled.text": "Voltaste sem terminar o pagamento. Não houve nenhuma cobrança — podes tentar novamente quando quiseres.",
      "confirm.error.title": "Não conseguimos confirmar o pagamento",
      "confirm.error.text": "Algo falhou ao verificar o resultado. Se chegaste a pagar, escreve-nos para hola@uperfumes.com com a hora aproximada para revermos."
    }
  };

  function t(key) {
    var dict = I18N[currentLang] || I18N.es;
    return (key in dict) ? dict[key] : (I18N.es[key] || "");
  }

  function pf(p) {
    // Ficha del perfume (family/desc/notes) en el idioma actual, con
    // reserva en español si algo faltara.
    return p.i18n[currentLang] || p.i18n.es;
  }

  // FIELD_LABELS ya no es un objeto fijo: se arma leyendo I18N en el
  // idioma actual, así el texto "Coincide en ..." del recomendador
  // cambia de idioma junto con el resto de la página.
  function fieldLabel(group, value) {
    return t("finder.matched." + group + "." + value);
  }

  // Lo que comparten las demás páginas (cart.js, producto.js, checkout.js):
  // textos traducidos, fichas de los perfumes y el idioma actual.
  window.UPerfumes = {
    PERFUMES: PERFUMES,
    t: t,
    pf: pf,
    formatCLP: formatCLP,
    getLang: function () { return currentLang; }
  };

  var finderForm = document.getElementById("finderForm");
  var finderSubmit = document.getElementById("finderSubmit");
  var finderReset = document.getElementById("finderReset");
  var finderHint = document.getElementById("finderHint");
  var finderResult = document.getElementById("finderResult");

  if (finderForm && finderSubmit && finderResult) {
    var finderState = { occasion: null, climate: null, age: null, budget: null };

    function checkComplete() {
      var complete =
        finderState.occasion && finderState.climate && finderState.age && finderState.budget;
      finderSubmit.disabled = !complete;
      finderHint.textContent = complete ? t("finder.hintComplete") : t("finder.hintIncomplete");
    }

    // Delegación de clics para los cuatro grupos de opciones (radiogroups)
    finderForm.querySelectorAll(".finder-options").forEach(function (group) {
      var field = group.getAttribute("data-field");
      group.addEventListener("click", function (e) {
        var chip = e.target.closest(".filter-chip");
        if (!chip) return;

        group.querySelectorAll(".filter-chip").forEach(function (c) {
          c.setAttribute("aria-checked", "false");
        });
        chip.setAttribute("aria-checked", "true");
        finderState[field] = chip.getAttribute("data-value");
        checkComplete();
      });
    });

    function ageScore(bracket, min, max) {
      var parts = bracket.split("-").map(Number);
      var bMin = parts[0], bMax = parts[1];
      if (bMin <= max && bMax >= min) return 2;
      var gap = bMin > max ? bMin - max : min - bMax;
      return gap <= 10 ? 1 : 0;
    }

    function budgetScore(selected, actual) {
      if (!selected || selected === "cualquiera") return 0;
      if (selected === actual) return 2;
      var d = Math.abs(BUDGET_ORDER.indexOf(selected) - BUDGET_ORDER.indexOf(actual));
      return d === 1 ? 0.5 : 0;
    }

    function scorePerfume(p) {
      var score = 0;
      var matched = [];

      if (finderState.occasion && p.occasions.indexOf(finderState.occasion) !== -1) {
        score += 3;
        matched.push(fieldLabel("occasion", finderState.occasion));
      }
      if (finderState.climate && p.climates.indexOf(finderState.climate) !== -1) {
        score += 3;
        matched.push(fieldLabel("climate", finderState.climate));
      }
      if (finderState.age) {
        var aScore = ageScore(finderState.age, p.ageMin, p.ageMax);
        score += aScore;
        if (aScore >= 2) matched.push(fieldLabel("age", finderState.age));
      }
      if (finderState.budget) {
        var bScore = budgetScore(finderState.budget, p.budget);
        score += bScore;
        if (bScore >= 2) matched.push(fieldLabel("budget", finderState.budget));
      }

      return { perfume: p, score: score, matched: matched };
    }

    function cardMarkup(entry, index, isTop) {
      var p = entry.perfume;
      var f = pf(p);
      var matchText = entry.matched.length
        ? t("finder.matchPrefix") + entry.matched.join(", ") + "."
        : t("finder.matchNone");

      return (
        '<article class="finder-card' + (isTop ? " is-top" : "") + '" style="--i:' + index + '">' +
          '<p class="finder-card__tag">' + (isTop ? t("finder.top") : t("finder.alsoLike")) + "</p>" +
          '<a class="perfume-card__imglink" href="producto.html?id=' + p.id + '">' +
          '<div class="perfume-card__image">' +
            '<img src="images/' + p.id + '.jpg" alt="' + t("bottleAlt") + p.house + " " + p.name + '" loading="lazy">' +
            '<div class="image-placeholder">' +
              '<svg class="placeholder-icon" viewBox="0 0 48 64" fill="none" aria-hidden="true"><path d="M18 8H30V16C30 16 38 21 38 31V56C38 59 35.5 61 33 61H15C12.5 61 10 59 10 56V31C10 21 18 16 18 16V8Z" stroke="currentColor" stroke-width="1.4"/><path d="M15 4H33V8H15V4Z" stroke="currentColor" stroke-width="1.4"/></svg>' +
              "<p>" + t("collection.imgPlaceholder") + "</p>" +
              "<code>images/" + p.id + ".jpg</code>" +
              "<span>" + t("collection.imgSize") + "</span>" +
            "</div>" +
          "</div></a>" +
          '<p class="perfume-card__house">' + p.house + "</p>" +
          '<h3 class="perfume-card__name"><a class="perfume-card__namelink" href="producto.html?id=' + p.id + '">' + p.name + ' <span class="badge">' + p.badge + "</span></a></h3>" +
          '<p class="perfume-card__family">' + f.family + "</p>" +
          '<p class="perfume-card__desc">' + f.desc + "</p>" +
          '<div class="perfume-card__decants">' +
            '<p class="decants-label">' + t("collection.decantsLabel") + "</p>" +
            '<ul class="decant-list">' +
              '<li><button type="button" class="decant-buy" data-perfume="' + p.id + '" data-ml="3"><span class="decant-ml">3 ml</span><span class="decant-price">' + formatCLP(p.prices[3]) + '</span></button></li>' +
              '<li><button type="button" class="decant-buy" data-perfume="' + p.id + '" data-ml="5"><span class="decant-ml">5 ml</span><span class="decant-price">' + formatCLP(p.prices[5]) + '</span></button></li>' +
              '<li><button type="button" class="decant-buy" data-perfume="' + p.id + '" data-ml="10"><span class="decant-ml">10 ml</span><span class="decant-price">' + formatCLP(p.prices[10]) + '</span></button></li>' +
            "</ul>" +
          "</div>" +
          '<p class="perfume-card__notes"><strong>' + t("collection.notesTop") + "</strong> " + f.notes.top +
            " · <strong>" + t("collection.notesHeart") + "</strong> " + f.notes.heart +
            " · <strong>" + t("collection.notesBase") + "</strong> " + f.notes.base + "</p>" +
          '<p class="finder-match">' + matchText + "</p>" +
        "</article>"
      );
    }

    function renderResults() {
      var ranked = PERFUMES.map(scorePerfume).sort(function (a, b) {
        return b.score - a.score;
      });
      var top3 = ranked.slice(0, 3);

      var html =
        '<p class="finder-result-lead">' + t("finder.resultLead") + "</p>" +
        '<div class="finder-result-grid">' +
        top3.map(function (entry, i) { return cardMarkup(entry, i, i === 0); }).join("") +
        "</div>";

      finderResult.innerHTML = html;
      finderResult.hidden = false;

      finderResult.querySelectorAll(".perfume-card__image img").forEach(bindImageFallback);

      finderResult.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }

    finderForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (finderSubmit.disabled) return;
      renderResults();
      finderReset.hidden = false;
    });

    if (finderReset) {
      finderReset.addEventListener("click", function () {
        finderState = { occasion: null, climate: null, age: null, budget: null };
        finderForm.querySelectorAll(".filter-chip").forEach(function (c) {
          c.setAttribute("aria-checked", "false");
        });
        finderResult.hidden = true;
        finderResult.innerHTML = "";
        finderReset.hidden = true;
        checkComplete();
        finderForm.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      });
    }

    checkComplete();
  }

  /* ---------------------------------------------------------------------
     8. Botón "bajar al catálogo" del hero
     --------------------------------------------------------------------- */
  var scrollCue = document.getElementById("scrollCue");
  if (scrollCue) {
    scrollCue.addEventListener("click", function () {
      var target = document.getElementById("coleccion");
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  }

  /* ---------------------------------------------------------------------
     8b. Comprar un decant (sin carrito, a propósito)
     ---------------------------------------------------------------------
     Flujo de UN solo producto a la vez:
       1) clic en una fila de decant (catálogo o recomendador) → se llena
          #buyPanel con esa fragancia y ese formato.
       2) la persona puede cambiar el formato ahí mismo (el precio se
          recalcula) y pulsa "Continuar al pago".
       3) se revela el paso de confirmación: como todavía no hay una
          pasarela de pago conectada (ver la sección Información y la
          conversación sobre Flow/Webpay), esto no cobra nada — genera un
          correo pre-rellenado con el pedido exacto para confirmarlo a
          mano. El día que conectes un link de pago real, reemplaza el
          bloque marcado más abajo por un botón que apunte a ese link.

     El listener va en <body> (delegación de eventos) para que funcione
     tanto con las 33 filas ya presentes en el HTML como con las que el
     recomendador crea dinámicamente, sin tener que re-enlazarlas.
  */
  var buyPanel = document.getElementById("buyPanel");

  function buildBuyFormats(perfume, selectedMl) {
    return [3, 5, 10].map(function (ml) {
      var checked = ml === selectedMl;
      return (
        '<button type="button" class="filter-chip" role="radio" aria-checked="' + checked + '" data-ml="' + ml + '">' +
          ml + " ml · " + formatCLP(perfume.prices[ml]) +
        "</button>"
      );
    }).join("");
  }

  // "Comprar ahora" lleva a pedido.html con SOLO lo mínimo en la URL (qué
  // perfume, qué formato, cuántos). Nombres y precios los trae esa página
  // del catálogo del servidor, y el monto real lo calcula el servidor.
  function buyOrderUrl(perfume, ml) {
    var params = new URLSearchParams({ id: perfume.id, ml: String(ml), qty: "1" });
    return "pedido.html?" + params.toString();
  }

  function productUrl(perfume) {
    return "producto.html?id=" + encodeURIComponent(perfume.id);
  }

  function renderBuyPanel(perfume, ml) {
    if (!buyPanel) return;
    var url = productUrl(perfume);

    buyPanel.innerHTML =
      '<div class="buy-active">' +
        '<div class="buy-product">' +
          '<a class="perfume-card__imglink buy-product__imglink" href="' + url + '">' +
            '<div class="perfume-card__image">' +
              '<img src="images/' + perfume.id + '.jpg" alt="' + t("bottleAlt") + perfume.house + " " + perfume.name + '" loading="lazy">' +
              '<div class="image-placeholder">' +
                '<svg class="placeholder-icon" viewBox="0 0 48 64" fill="none" aria-hidden="true"><path d="M18 8H30V16C30 16 38 21 38 31V56C38 59 35.5 61 33 61H15C12.5 61 10 59 10 56V31C10 21 18 16 18 16V8Z" stroke="currentColor" stroke-width="1.4"/><path d="M15 4H33V8H15V4Z" stroke="currentColor" stroke-width="1.4"/></svg>' +
                "<p>" + t("collection.imgPlaceholder") + "</p>" +
                "<code>images/" + perfume.id + ".jpg</code>" +
              "</div>" +
            "</div>" +
          "</a>" +
          "<div>" +
            '<p class="perfume-card__house">' + perfume.house + "</p>" +
            '<h3 class="buy-product__name"><a class="perfume-card__namelink" href="' + url + '">' + perfume.name + ' <span class="badge">' + perfume.badge + "</span></a></h3>" +
          "</div>" +
        "</div>" +

        '<div class="buy-step" data-step="format">' +
          '<p class="buy-step__label">' + t("buy.step1") + "</p>" +
          '<div class="buy-formats" role="radiogroup" aria-label="' + t("buy.formatAriaLabel") + '" id="buyFormats">' +
            buildBuyFormats(perfume, ml) +
          "</div>" +
          '<p class="buy-summary" id="buySummary">' + t("buy.summaryPrefix") + "<strong>" + perfume.name + " — " + ml + " ml — " + formatCLP(perfume.prices[ml]) + "</strong></p>" +
          '<div class="buy-actions">' +
            '<a class="cart-btn cart-btn--primary" id="buyNowLink" href="' + buyOrderUrl(perfume, ml) + '">' + t("buy.buyNow") + "</a>" +
            '<button type="button" class="cart-btn cart-btn--ghost" id="buyAddBtn">' + t("buy.addToCart") + "</button>" +
          "</div>" +
        "</div>" +
      "</div>";

    buyPanel.querySelectorAll(".perfume-card__image img").forEach(bindImageFallback);

    var formatsWrap = document.getElementById("buyFormats");
    var summary = document.getElementById("buySummary");
    var buyNowLink = document.getElementById("buyNowLink");
    var addBtn = document.getElementById("buyAddBtn");
    var currentMl = ml;

    if (formatsWrap) {
      formatsWrap.addEventListener("click", function (e) {
        var chip = e.target.closest(".filter-chip");
        if (!chip) return;
        currentMl = Number(chip.getAttribute("data-ml"));

        formatsWrap.querySelectorAll(".filter-chip").forEach(function (c) {
          c.setAttribute("aria-checked", "false");
        });
        chip.setAttribute("aria-checked", "true");

        if (summary) {
          summary.innerHTML = t("buy.summaryPrefix") + "<strong>" + perfume.name + " — " + currentMl + " ml — " + formatCLP(perfume.prices[currentMl]) + "</strong>";
        }
        if (buyNowLink) buyNowLink.href = buyOrderUrl(perfume, currentMl);
      });
    }

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        // El carrito vive en cart.js; al agregar, su panel se despliega a la derecha.
        if (window.UPCart && window.UPCart.add(perfume.id, currentMl, 1)) {
          window.UPCart.open();
        }
      });
    }
  }

  function openBuy(perfumeId, ml) {
    var perfume = PERFUMES.filter(function (p) { return p.id === perfumeId; })[0];
    if (!perfume || !buyPanel) return;

    renderBuyPanel(perfume, ml);

    var section = document.getElementById("comprar");
    if (section) section.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }

  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".decant-buy");
    if (!btn) return;
    openBuy(btn.getAttribute("data-perfume"), Number(btn.getAttribute("data-ml")));
  });

  /* ---------------------------------------------------------------------
     9. HUB — interruptor de modo claro/oscuro
     ---------------------------------------------------------------------
     Aplica/retira el atributo data-theme="light" en <html> y guarda la
     elección (ver sección 12). Sin una elección guardada, el sitio
     arranca en modo oscuro, que es el tema por defecto de UPerfumes.
  */
  var themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var isLight = document.documentElement.getAttribute("data-theme") === "light";
      var next = isLight ? null : "light";

      if (next) {
        document.documentElement.setAttribute("data-theme", next);
      } else {
        document.documentElement.removeAttribute("data-theme");
      }

      themeToggle.setAttribute("aria-checked", String(!isLight));
      themeToggle.setAttribute("aria-label", t(isLight ? "themeToggleLight" : "themeToggleDark"));
      storeSet("up_theme", next ? "light" : "dark");
    });
  }

  /* ---------------------------------------------------------------------
     10. HUB — resaltar la sección activa mientras se hace scroll
     --------------------------------------------------------------------- */
  var hubLinks = document.querySelectorAll(".hub-link");
  if (hubLinks.length && "IntersectionObserver" in window) {
    var hubMap = {};
    hubLinks.forEach(function (link) {
      hubMap[link.getAttribute("data-section")] = link;
    });

    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = hubMap[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            hubLinks.forEach(function (l) { l.classList.remove("is-active"); });
            link.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    Object.keys(hubMap).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  /* ---------------------------------------------------------------------
     11. HUB — selector de idioma (español / inglés / portugués)
     ---------------------------------------------------------------------
     applyLanguage() hace tres cosas:
       1) recorre [data-i18n] / [data-i18n-aria] / [data-i18n-alt] y
          reemplaza su contenido con la traducción correspondiente;
       2) actualiza la ficha (familia, descripción, notas) de cada una
          de las 11 tarjetas del catálogo, ubicándolas por su atributo
          data-perfume — el catálogo es HTML estático, así que esto se
          hace a mano en vez de re-generarlo;
       3) si el recomendador o el panel de compra ya están mostrando
          algo, los vuelve a dibujar en el nuevo idioma en vez de dejarlos
          a medio traducir.
     Al terminar, avisa con el evento "uperfumes:languagechange" para que
     el carrito, la ficha de producto y el formulario de pago se redibujen.
  */
  function applyLanguage(lang) {
    if (!I18N[lang]) return;
    currentLang = lang;
    document.documentElement.lang = lang === "es" ? "es" : (lang === "en" ? "en" : "pt-PT");

    // <title data-i18n="..."> queda cubierto por el sweep genérico de abajo
    // (asignar textContent a <title> también actualiza la pestaña del
    // navegador). data-i18n-content cubre <meta name="description">, que
    // se traduce por su atributo content, no por texto visible.
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n"));
      if (!value) return;
      if (value.indexOf("<") !== -1) {
        el.innerHTML = value;
      } else {
        el.textContent = value;
      }
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-aria"));
      if (value) el.setAttribute("aria-label", value);
    });

    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-alt"));
      if (value) el.setAttribute("alt", value);
    });

    document.querySelectorAll("[data-i18n-content]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-content"));
      if (value) el.setAttribute("content", value);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-placeholder"));
      if (value) el.setAttribute("placeholder", value);
    });

    // Ficha de cada perfume dentro de las 11 tarjetas estáticas del catálogo
    document.querySelectorAll(".perfume-card[data-perfume]").forEach(function (card) {
      var perfume = PERFUMES.filter(function (p) { return p.id === card.getAttribute("data-perfume"); })[0];
      if (!perfume) return;
      var f = pf(perfume);

      var familyEl = card.querySelector(".perfume-card__family");
      var descEl = card.querySelector(".perfume-card__desc");
      var notesEl = card.querySelector(".perfume-card__notes");
      var imgEl = card.querySelector(".perfume-card__image img");

      if (familyEl) familyEl.textContent = f.family;
      if (descEl) descEl.textContent = f.desc;
      if (notesEl) {
        notesEl.innerHTML =
          "<strong>" + t("collection.notesTop") + "</strong> " + f.notes.top +
          " · <strong>" + t("collection.notesHeart") + "</strong> " + f.notes.heart +
          " · <strong>" + t("collection.notesBase") + "</strong> " + f.notes.base;
      }
      if (imgEl) imgEl.setAttribute("alt", t("bottleAlt") + perfume.house + " " + perfume.name);
    });

    // Estado del interruptor de tema (el texto del aria-label depende del idioma)
    if (themeToggle) {
      var isLightNow = document.documentElement.getAttribute("data-theme") === "light";
      themeToggle.setAttribute("aria-label", t(isLightNow ? "themeToggleDark" : "themeToggleLight"));
    }

    // Si el recomendador ya tiene un resultado visible, se re-dibuja en el nuevo idioma
    if (finderResult && !finderResult.hidden) {
      renderResults();
    }

    // Si el panel de compra ya tiene un producto activo, se re-dibuja también
    if (buyPanel) {
      var activePanel = buyPanel.querySelector(".buy-active");
      if (activePanel) {
        var activeChip = activePanel.querySelector('.buy-formats .filter-chip[aria-checked="true"]');
        var activeId = document.querySelector(".buy-product .perfume-card__image img");
        // El id del perfume activo se recupera desde la ruta de la imagen
        var match = activeId ? activeId.getAttribute("src").match(/images\/([a-z0-9-]+)\.jpg/) : null;
        var activePerfume = match ? PERFUMES.filter(function (p) { return p.id === match[1]; })[0] : null;
        if (activePerfume) {
          var activeMl = activeChip ? Number(activeChip.getAttribute("data-ml")) : 3;
          renderBuyPanel(activePerfume, activeMl);
        }
      }
    }

    // Marca la bandera activa en el HUB
    document.querySelectorAll(".hub-lang__btn").forEach(function (btn) {
      var isActive = btn.getAttribute("data-lang") === lang;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });

    // Avisa a las piezas que dibujan su propio contenido (carrito, ficha de
    // producto, formulario de pago) para que se vuelvan a dibujar.
    document.dispatchEvent(new CustomEvent("uperfumes:languagechange", { detail: { lang: lang } }));
  }

  document.querySelectorAll(".hub-lang__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var lang = btn.getAttribute("data-lang");
      applyLanguage(lang);
      storeSet("up_lang", lang);
    });
  });

  /* ---------------------------------------------------------------------
     12. Recordar tema e idioma entre páginas
     ---------------------------------------------------------------------
     Con catálogo, ficha de producto, carrito y pago en páginas distintas,
     volver a español/oscuro en cada clic sería molesto: la elección se
     guarda en el navegador y cada página la recupera al cargar. Si el
     navegador no permite almacenamiento, simplemente no se recuerda.
  */
  var savedTheme = storeGet("up_theme");
  if (savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    if (themeToggle) {
      themeToggle.setAttribute("aria-checked", "true");
      themeToggle.setAttribute("aria-label", t("themeToggleDark"));
    }
  }

  var savedLang = storeGet("up_lang");
  if (savedLang && savedLang !== "es" && I18N[savedLang]) {
    applyLanguage(savedLang);
  }
})();
