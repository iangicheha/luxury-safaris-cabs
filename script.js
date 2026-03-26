const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const navToggle = document.querySelector(".nav__toggle");
const menu = document.getElementById("mobile-menu");
const menuClose = document.querySelector(".menu__close");
const menuOverlay = document.querySelector("[data-menu-overlay]");

function setMenuOpen(isOpen) {
  if (!menu || !navToggle || !menuOverlay) return;

  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");

  menu.hidden = false;
  menuOverlay.hidden = false;
  menu.dataset.open = String(isOpen);

  if (!isOpen) {
    menu.removeAttribute("data-open");
    menu.hidden = true;
    menuOverlay.hidden = true;
    navToggle.focus();
  } else {
    const firstLink = menu.querySelector("a");
    if (firstLink) firstLink.focus();
  }
}

if (navToggle && menu && menuOverlay) {
  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    setMenuOpen(!expanded);
  });

  if (menuClose) {
    menuClose.addEventListener("click", () => setMenuOpen(false));
  }

  menuOverlay.addEventListener("click", () => setMenuOpen(false));

  menu.addEventListener("click", (e) => {
    const target = e.target;
    if (target instanceof HTMLAnchorElement) setMenuOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenuOpen(false);
  });
}

const form = document.getElementById("inquiry-form");
const routeFromEl = document.getElementById("route-from");
const routeToEl = document.getElementById("route-to");
const routeDistanceEl = document.getElementById("route-distance");
const routeFromSuggestionsEl = document.getElementById("route-from-suggestions");
const routeToSuggestionsEl = document.getElementById("route-to-suggestions");
const destinationCards = document.querySelectorAll(".destination-card");
let routeRequestToken = 0;
const suggestionCache = new Map();

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(pointA, pointB) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLon = toRadians(pointB.lon - pointA.lon);
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function geocodePlace(place) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    place
  )}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error("Failed to geocode location");
  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Location not found");
  }
  const best = results[0];
  return {
    label: best.display_name || place,
    lat: Number(best.lat),
    lon: Number(best.lon),
  };
}

async function fetchLocationSuggestions(query) {
  const q = query.trim();
  if (q.length < 3) return [];
  const cacheKey = q.toLowerCase();
  if (suggestionCache.has(cacheKey)) return suggestionCache.get(cacheKey);

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
    q
  )}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const results = await response.json();
  const suggestions = Array.isArray(results)
    ? results
        .map((item) => item.display_name)
        .filter(Boolean)
        .slice(0, 5)
    : [];
  suggestionCache.set(cacheKey, suggestions);
  return suggestions;
}

function populateSuggestionList(datalistEl, suggestions) {
  if (!datalistEl) return;
  datalistEl.innerHTML = "";
  for (const item of suggestions) {
    const option = document.createElement("option");
    option.value = item;
    datalistEl.appendChild(option);
  }
}

function attachLocationAutocomplete(inputEl, datalistEl) {
  if (!inputEl || !datalistEl) return;
  let debounceTimer = null;

  inputEl.addEventListener("input", () => {
    const query = inputEl.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const suggestions = await fetchLocationSuggestions(query);
      if (inputEl.value.trim() !== query) return;
      populateSuggestionList(datalistEl, suggestions);
    }, 280);
  });
}

attachLocationAutocomplete(routeFromEl, routeFromSuggestionsEl);
attachLocationAutocomplete(routeToEl, routeToSuggestionsEl);

async function updateRouteDistance() {
  if (!routeFromEl || !routeToEl || !routeDistanceEl) return;
  const fromPlace = routeFromEl.value.trim();
  const toPlace = routeToEl.value.trim();
  const currentToken = ++routeRequestToken;

  if (!fromPlace || !toPlace) {
    routeDistanceEl.value = "";
    return;
  }

  if (fromPlace.toLowerCase() === toPlace.toLowerCase()) {
    routeDistanceEl.value = "0 km (0 miles) • about 0 min";
    return;
  }

  routeDistanceEl.value = "Calculating road distance...";
  routeDistanceEl.dataset.mode = "road-pending";
  let fromPoint;
  let toPoint;

  try {
    [fromPoint, toPoint] = await Promise.all([
      geocodePlace(fromPlace),
      geocodePlace(toPlace),
    ]);
  } catch {
    if (currentToken !== routeRequestToken) return;
    routeDistanceEl.value = "Could not find one of the locations";
    routeDistanceEl.dataset.mode = "error";
    return;
  }

  if (currentToken !== routeRequestToken) return;

  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromPoint.lon},${fromPoint.lat};${toPoint.lon},${toPoint.lat}?overview=false`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) throw new Error("Routing request failed");
    const data = await response.json();
    const route = data && data.routes && data.routes[0];
    if (!route) throw new Error("No route found");
    if (currentToken !== routeRequestToken) return;

    const km = route.distance / 1000;
    const miles = km * 0.621371;
    const totalMinutes = Math.round(route.duration / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const timeText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

    routeDistanceEl.value = `${km.toFixed(1)} km (${miles.toFixed(
      1
    )} miles) • about ${timeText}`;
    routeDistanceEl.dataset.mode = "road";
  } catch {
    // Fallback when routing API is unavailable.
    if (currentToken !== routeRequestToken) return;
    const km = haversineDistanceKm(fromPoint, toPoint);
    const miles = km * 0.621371;
    routeDistanceEl.value = `${km.toFixed(1)} km (${miles.toFixed(
      1
    )} miles) • estimate`;
    routeDistanceEl.dataset.mode = "estimate";
  }
}

if (routeFromEl && routeToEl) {
  routeFromEl.addEventListener("change", updateRouteDistance);
  routeToEl.addEventListener("change", updateRouteDistance);
  routeFromEl.addEventListener("blur", updateRouteDistance);
  routeToEl.addEventListener("blur", updateRouteDistance);
}

if (destinationCards.length && routeToEl) {
  destinationCards.forEach((card) => {
    card.addEventListener("click", () => {
      const destination = card.getAttribute("data-destination");
      if (!destination) return;
      routeToEl.value = destination;
      routeToEl.dispatchEvent(new Event("change"));
      const contactSection = document.getElementById("contact");
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      routeToEl.focus();
    });
  });
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const travelDates = String(formData.get("travelDates") || "").trim();
    const groupSize = String(formData.get("groupSize") || "").trim();
    const routeFrom = String(formData.get("routeFrom") || "").trim();
    const routeTo = String(formData.get("routeTo") || "").trim();
    const routeDistance = String(formData.get("routeDistance") || "").trim();
    const interests = String(formData.get("interests") || "").trim();

    const statusEl = form.querySelector(".form__status");
    const setStatus = (message, kind) => {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove("form__status--ok", "form__status--error");
      if (kind === "ok") statusEl.classList.add("form__status--ok");
      if (kind === "error") statusEl.classList.add("form__status--error");
    };

    if (!name || !email) {
      setStatus("Please enter your name and email so we can reach you.", "error");
      return;
    }

    const toEmail = form.dataset.bookingEmail || "";
    if (!toEmail) {
      setStatus("Missing booking email setup. Please contact site admin.", "error");
      return;
    }
    const subject = encodeURIComponent("New LuxurySafaris inquiry");
    const body = encodeURIComponent(
      [
        `Name: ${name}`,
        `Email: ${email}`,
        travelDates ? `Preferred travel dates: ${travelDates}` : null,
        groupSize ? `Group size: ${groupSize}` : null,
        routeFrom ? `From: ${routeFrom}` : null,
        routeTo ? `To: ${routeTo}` : null,
        routeDistance ? `Estimated distance: ${routeDistance}` : null,
        interests ? `Interests:\n${interests}` : null,
        "",
        "Sent from the LuxurySafaris website.",
      ]
        .filter(Boolean)
        .join("\n")
    );

    setStatus("Thanks! Opening your email app to send the inquiry…", "ok");
    window.location.href = `mailto:${toEmail}?subject=${subject}&body=${body}`;
    form.reset();
  });
}

const reviewsGroupA = document.getElementById("reviewsGroupA");
const reviewsGroupB = document.getElementById("reviewsGroupB");

if (reviewsGroupA && reviewsGroupB) {
  const flags = [
    { country: "Kenya", flag: "🇰🇪" },
    { country: "Tanzania", flag: "🇹🇿" },
    { country: "Uganda", flag: "🇺🇬" },
    { country: "Rwanda", flag: "🇷🇼" },
    { country: "Ethiopia", flag: "🇪🇹" },
    { country: "South Africa", flag: "🇿🇦" },
    { country: "Nigeria", flag: "🇳🇬" },
    { country: "Ghana", flag: "🇬🇭" },
    { country: "Egypt", flag: "🇪🇬" },
    { country: "Morocco", flag: "🇲🇦" },
    { country: "Algeria", flag: "🇩🇿" },
    { country: "Tunisia", flag: "🇹🇳" },
    { country: "Botswana", flag: "🇧🇼" },
    { country: "Namibia", flag: "🇳🇦" },
    { country: "Zambia", flag: "🇿🇲" },
    { country: "Zimbabwe", flag: "🇿🇼" },
    { country: "Malawi", flag: "🇲🇼" },
    { country: "Mozambique", flag: "🇲🇿" },
    { country: "Somalia", flag: "🇸🇴" },
    { country: "Cameroon", flag: "🇨🇲" },
    { country: "Senegal", flag: "🇸🇳" },
    { country: "Mali", flag: "🇲🇱" },
    { country: "Cote d’Ivoire", flag: "🇨🇮" },
    { country: "United Kingdom", flag: "🇬🇧" },
    { country: "France", flag: "🇫🇷" },
    { country: "Spain", flag: "🇪🇸" },
    { country: "Italy", flag: "🇮🇹" },
    { country: "Germany", flag: "🇩🇪" },
    { country: "Netherlands", flag: "🇳🇱" },
    { country: "Sweden", flag: "🇸🇪" },
    { country: "Norway", flag: "🇳🇴" },
    { country: "Denmark", flag: "🇩🇰" },
    { country: "United States", flag: "🇺🇸" },
    { country: "Canada", flag: "🇨🇦" },
    { country: "Brazil", flag: "🇧🇷" },
    { country: "Argentina", flag: "🇦🇷" },
    { country: "Mexico", flag: "🇲🇽" },
    { country: "China", flag: "🇨🇳" },
    { country: "Japan", flag: "🇯🇵" },
    { country: "India", flag: "🇮🇳" },
    { country: "UAE", flag: "🇦🇪" },
    { country: "Saudi Arabia", flag: "🇸🇦" },
    { country: "Australia", flag: "🇦🇺" },
    { country: "New Zealand", flag: "🇳🇿" },
    { country: "Ireland", flag: "🇮🇪" },
    { country: "Poland", flag: "🇵🇱" },
    { country: "Turkey", flag: "🇹🇷" },
    { country: "Greece", flag: "🇬🇷" },
    { country: "Portugal", flag: "🇵🇹" },
    { country: "Finland", flag: "🇫🇮" },
  ];

  const firstNames = [
    "Amina",
    "James",
    "Fatima",
    "Daniel",
    "Sofia",
    "Oliver",
    "Mariam",
    "Lucas",
    "Zuri",
    "Ethan",
    "Chantal",
    "Noah",
    "Grace",
    "Mason",
    "Hassan",
    "Amara",
    "Liam",
    "Aisha",
    "Victoria",
    "Leo",
    "Nadia",
    "Samuel",
    "Leila",
    "Elijah",
    "Tariq",
    "Zara",
    "Omar",
    "Isabella",
    "Ken",
    "Aaliyah",
    "Theo",
    "Musa",
    "Claire",
    "Ava",
    "Kofi",
    "Ryan",
    "Imani",
    "Carla",
    "Mohamed",
    "Elena",
  ];

  const lastNames = [
    "Mwangi",
    "Okello",
    "Mensah",
    "Kilonzo",
    "Suleiman",
    "Nakamura",
    "Hassan",
    "Petrov",
    "Smith",
    "Brown",
    "Nguyen",
    "Silva",
    "Diallo",
    "Khan",
    "Ibrahim",
    "Martinez",
    "Johnson",
    "Wang",
    "Rossi",
    "Bello",
  ];

  const notes = [
    "Amazing trip—everything was smooth from pickup to the game drives.",
    "Beautiful landscapes and friendly guides. We saw amazing wildlife.",
    "Great planning and great communication. Felt safe the whole time.",
    "Luxury experience all the way. Comfortable rides and great hospitality.",
    "The itinerary was perfect for our family—fun and well organized.",
    "Highly recommend—our driver was professional and punctual.",
    "Every day felt special. Excellent service and unforgettable moments.",
    "Well-paced schedule and amazing views. We loved Hell’s Gate too.",
    "Strong attention to detail. Transfers were seamless and on time.",
    "Friendly team and great lodges. A trip we will remember forever.",
  ];

  const destinations = [
    "Maasai Mara",
    "Hell’s Gate",
    "Nakuru",
    "Amboseli",
    "Naivasha",
    "Serengeti (nearby experience)",
  ];

  const reviewTemplates = [];
  const totalReviews = 50;
  for (let i = 0; i < totalReviews; i++) {
    const flag = flags[i % flags.length];
    const first = firstNames[i % firstNames.length];
    const last = lastNames[(i * 3) % lastNames.length];
    const note = notes[i % notes.length];
    const dest = destinations[i % destinations.length];
    const stars = 5;
    reviewTemplates.push({ flag, first, last, note: `${note} Loved ${dest}.`, stars });
  }

  const renderCard = (r) => {
    const twemojiUrlForFlag = (emoji, size = 72) => {
      // Convert emoji string to Twemoji codepoint URL.
      // Example: 🇰🇪 -> 1f1f0-1f1ea
      const codepoints = Array.from(emoji)
        .map((ch) => ch.codePointAt(0).toString(16))
        .join("-");
      return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/${size}x${size}/${codepoints}.png`;
    };

    const flagEmoji = r.flag.flag;
    const flagSrc = twemojiUrlForFlag(flagEmoji, 72);
    const flagAlt = `Flag of ${r.flag.country}`;

    return `
      <div class="review-card" aria-label="Sample review">
        <div class="review-card__top">
          <div class="review-card__who">
            <img
              class="review-card__flag"
              src="${flagSrc}"
              alt="${flagAlt}"
              loading="lazy"
              decoding="async"
            />
            <div class="review-card__name-wrap">
              <div class="review-card__name">${r.first} ${r.last}</div>
              <div class="review-card__country" style="color: var(--text-muted); font-size: 0.85rem;">
                ${r.flag.country}
              </div>
            </div>
          </div>
          <div class="review-card__stars" aria-label="${r.stars} stars">
            ${"★".repeat(r.stars)}
          </div>
        </div>
        <p class="review-card__note">${r.note}</p>
      </div>
    `;
  };

  const groupAHtml = reviewTemplates.map(renderCard).join("");
  reviewsGroupA.innerHTML = groupAHtml;
  // Duplicate group A so the marquee can loop seamlessly.
  reviewsGroupB.innerHTML = groupAHtml;
}

