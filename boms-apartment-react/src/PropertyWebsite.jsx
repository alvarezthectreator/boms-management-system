import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Dumbbell,
  LogIn,
  Menu,
  Phone,
  Sparkles,
  Utensils,
  Waves,
  X,
} from "lucide-react";
import "./PropertyWebsite.css";

const currentYear = new Date().getFullYear();
const defaultRoomImage = "/galaxy/defaultroom.png";
const fallbackRooms = [
  {
    id: "studio",
    name: "Studio Suite",
    sizeM2: 42,
    bedType: "King bed",
    maxGuests: 2,
    description: "A stylish suite with a calming palette and all the essentials for a comfortable stay.",
    rateKobo: 8500000,
    images: ["/galaxy/hotels/port-harcourt/rooms/presidential/01.jpg"],
  },
  {
    id: "deluxe",
    name: "Deluxe Room",
    sizeM2: 36,
    bedType: "Queen bed",
    maxGuests: 3,
    description: "A welcoming room with generous natural light, warm finishes, and refined comfort.",
    rateKobo: 6800000,
    images: ["/galaxy/hotels/port-harcourt/cover.jpg"],
  },
  {
    id: "family",
    name: "Family Retreat",
    sizeM2: 52,
    bedType: "King bed + sofa bed",
    maxGuests: 4,
    description: "Spacious and contemporary, designed for longer stays and relaxed family time.",
    rateKobo: 9800000,
    images: ["/galaxy/hotels/port-harcourt/facilities/restaurant.jpg"],
  },
];
const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function StaySearch({ rooms, roomTypeId, onRoomTypeChange, guests, onGuestsChange }) {
  function submit(event) {
    event.preventDefault();
    document.getElementById("destinations")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <form className="galaxy-search" onSubmit={submit} aria-label="Find a stay">
      <label className="galaxy-search__field">
        <span>Room type</span>
        <select value={roomTypeId} onChange={(event) => onRoomTypeChange(event.target.value)}>
          <option value="all">All room types</option>
          {rooms.map((room) => (
              <option value={room.id} key={room.id}>{room.name}</option>
            ))}
        </select>
      </label>
      <label className="galaxy-search__field galaxy-search__guests">
        <span>Guests</span>
        <select value={guests} onChange={(event) => onGuestsChange(Number(event.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((count) => (
            <option value={count} key={count}>{count} {count === 1 ? "guest" : "guests"}</option>
          ))}
        </select>
      </label>
      <button className="galaxy-search__submit" type="submit">
        Show rooms <ArrowDown size={16} aria-hidden="true" />
      </button>
    </form>
  );
}

export default function PropertyWebsite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [guests, setGuests] = useState(2);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [roomsStatus, setRoomsStatus] = useState("loading");
  const closeMenu = () => setMenuOpen(false);
  const chooseRoomType = (id) => { setRoomTypeId(id); setShowAllRooms(false); };
  const chooseGuests = (count) => { setGuests(count); setShowAllRooms(false); };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/rooms")
      .then(async (response) => {
        if (!response.ok) throw new Error("Room information is unavailable.");
        return response.json();
      })
      .then((result) => {
        if (cancelled) return;
        setRooms(Array.isArray(result) && result.length > 0 ? result : fallbackRooms);
        setRoomsStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setRooms(fallbackRooms);
          setRoomsStatus("ready");
        }
      });
    return () => { cancelled = true; };
  }, []);

  const visibleRooms = rooms.filter((room) =>
    (roomTypeId === "all" || room.id === roomTypeId) && room.maxGuests >= guests,
  );
  const displayedRooms = showAllRooms ? visibleRooms : visibleRooms.slice(0, 6);

  return (
    <div className="galaxy-site">
      <header className="galaxy-header">
        <a className="galaxy-brand" href="/" aria-label="Boms Apartment home" onClick={closeMenu}>
          <span className="galaxy-brand-mark"><strong>BOMS</strong><span>Apartment</span></span>
        </a>
        <button
          className="galaxy-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="galaxy-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
          <span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
        <nav id="galaxy-navigation" className={`galaxy-nav${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <a href="#destinations" onClick={closeMenu}>Our rooms</a>
          <a href="#experiences" onClick={closeMenu}>Experiences</a>
          <a href="#story" onClick={closeMenu}>Our story</a>
          <a className="galaxy-nav__staff" href="/dashboard" onClick={closeMenu}><LogIn size={15} /> Staff login</a>
          <a className="galaxy-nav__book" href="#book" onClick={closeMenu}>Book a stay <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <main>
        <section className="galaxy-hero" aria-labelledby="galaxy-hero-title">
          <img className="galaxy-hero__image" src="/galaxy/hotels/port-harcourt/Modern%20Tropical%20House%20Entrance.png" alt="Boms Apartment exterior in Port Harcourt" />
          <div className="galaxy-hero__shade" />
          <div className="galaxy-hero__content">
            <p className="galaxy-eyebrow">Boms Apartment <span /> Nigeria</p>
            <h1 id="galaxy-hero-title">The Haven of<br />Hospitality.</h1>
            <p className="galaxy-hero__lead">A Nigerian welcome, wherever the road takes you.</p>
            <a className="galaxy-hero__link" href="#destinations">Explore our rooms <ArrowDown size={15} /></a>
          </div>
          <div className="galaxy-hero__caption"><span>Boms Apartment</span><span>Rooms &amp; suites</span></div>
        </section>

        <section className="galaxy-booking" id="book" aria-label="Plan your stay">
          <div className="galaxy-booking__heading">
            <p className="galaxy-eyebrow galaxy-eyebrow--dark">Make it a stay to remember</p>
            <h2>Choose your room.</h2>
          </div>
          <StaySearch
            rooms={rooms}
            roomTypeId={roomTypeId}
            onRoomTypeChange={chooseRoomType}
            guests={guests}
            onGuestsChange={chooseGuests}
          />
          <p className="galaxy-booking__note">Browse room types and details configured for Boms Apartment.</p>
        </section>

        <section className="galaxy-destinations" id="destinations">
          <div className="galaxy-section-heading">
            <div>
              <p className="galaxy-eyebrow galaxy-eyebrow--dark">Stay with us</p>
              <h2>Rooms &amp; suites.<br /><em>Find your fit.</em></h2>
            </div>
            <p className="galaxy-section-heading__copy">Explore the room types currently configured in the Boms Apartment database.</p>
          </div>
          <div className="galaxy-room-grid">
            {roomsStatus === "loading" && <p className="galaxy-room-state">Loading room types…</p>}
            {roomsStatus === "error" && <p className="galaxy-room-state" role="alert">Room information is temporarily unavailable.</p>}
            {roomsStatus === "ready" && visibleRooms.length === 0 && (
              <p className="galaxy-room-state">No room types match those guest requirements.</p>
            )}
            {roomsStatus === "ready" && displayedRooms.map((room) => (
              <article className="galaxy-room" key={room.id}>
                <div className="galaxy-room__image">
                  <img src={room.images?.[0] || defaultRoomImage} alt={`${room.name} room`} loading="lazy" />
                  <span className="galaxy-room__capacity">Up to {room.maxGuests} guests</span>
                </div>
                <div className="galaxy-room__body">
                  <h3>{room.name}</h3>
                  <p className="galaxy-room__description">{room.description || "A comfortable stay at Boms Apartment."}</p>
                  <div className="galaxy-room__details">
                    {room.sizeM2 > 0 && <span>{room.sizeM2} m²</span>}
                    {room.bedType && <span>{room.bedType}</span>}
                  </div>
                  <div className="galaxy-room__footer">
                    <p>{room.rateKobo > 0 ? <><strong>{naira.format(room.rateKobo / 100)}</strong><span> / night</span></> : <strong>Rate on request</strong>}</p>
                    <a href="#book" onClick={() => chooseRoomType(room.id)}>Select room <ArrowUpRight size={15} /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {roomsStatus === "ready" && visibleRooms.length > 6 && (
            <div className="galaxy-room-more-wrap">
              <button className="galaxy-room-more" type="button" onClick={() => setShowAllRooms((shown) => !shown)}>
                {showAllRooms ? "Show fewer rooms" : "View more rooms"}
                {!showAllRooms && <ArrowDown size={15} aria-hidden="true" />}
              </button>
            </div>
          )}
        </section>

        <section className="galaxy-experiences" id="experiences">
          <div className="galaxy-experiences__intro">
            <p className="galaxy-eyebrow">Beyond the room</p>
            <h2>Room to relax.<br /><em>Space to celebrate.</em></h2>
            <p>Make the most of your time with signature dining, wellness, and gathering spaces at our Port Harcourt resort.</p>
            <a className="galaxy-text-link" href="#destinations">Explore our rooms <ArrowRight size={16} /></a>
          </div>
          <div className="galaxy-experiences__photos">
            <figure className="galaxy-experience galaxy-experience--pool">
              <img src="/galaxy/hotels/port-harcourt/Resort%20Pool%20Cafe%20Under%20Canopy.png" alt="Swimming pool and poolside café at Boms Apartment" loading="lazy" />
              <figcaption><Waves size={17} /> Poolside</figcaption>
            </figure>
            <figure className="galaxy-experience galaxy-experience--dining">
              <img src="/galaxy/hotels/port-harcourt/Neon-lit%20modern%20lounge%20and%20bar.png" alt="Neon-lit modern lounge and bar at Boms Apartment" loading="lazy" />
              <figcaption><Sparkles size={17} /> Lounge</figcaption>
            </figure>
            <figure className="galaxy-experience galaxy-experience--wellness">
              <img src="/galaxy/hotels/port-harcourt/Modern%20White%20House%20with%20Pool.png" alt="Modern white house with pool at Boms Apartment" loading="lazy" />
              <figcaption><Sparkles size={17} /> Bar</figcaption>
            </figure>
          </div>
        </section>

        <section className="galaxy-story" id="story">
          <div className="galaxy-story__image">
            <img src="/galaxy/hotels/port-harcourt/Modern%20Neon-Lit%20Marble%20Bedroom.png" alt="A modern marble bedroom at Boms Apartment" loading="lazy" />
            <span>Boms Apartment</span>
          </div>
          <div className="galaxy-story__copy">
            <p className="galaxy-eyebrow galaxy-eyebrow--dark">Nigerian, proudly</p>
            <h2>Hospitality,<br /><em>the way it should feel.</em></h2>
            <p>Boms Apartment brings thoughtful hospitality, warm service, and refined comfort to every guest stay, creating a welcoming home away from home in Port Harcourt.</p>
            <a className="galaxy-text-link" href="#">Our story <ArrowRight size={16} /></a>
            <div className="galaxy-story__hours">
              <span><Clock3 size={16} /> Check-in</span><strong>3:00 AM</strong>
              <span><Clock3 size={16} /> Check-out</span><strong>12:00 PM</strong>
            </div>
          </div>
        </section>

        <section className="galaxy-elite">
          <div className="galaxy-elite__mark"><Sparkles size={24} /></div>
          <div>
            <p className="galaxy-eyebrow">Boms Guest Benefits</p>
            <h2>Every stay can take you further.</h2>
            <p>Discover member benefits across stays, dining, and more.</p>
          </div>
          <a href="#destinations">Discover Boms Apartment <ArrowUpRight size={16} /></a>
        </section>
      </main>

      <footer className="galaxy-footer">
        <div className="galaxy-footer__main">
          <div className="galaxy-footer__brand">
            <span className="galaxy-footer-mark"><strong>BOMS</strong><span>Apartment</span></span>
            <p>Boms Apartment<br />A welcoming stay in Nigeria.</p>
          </div>
          <div className="galaxy-footer__contact">
            <p className="galaxy-eyebrow galaxy-eyebrow--dark">Reservations</p>
            <a href="tel:+2349169842001"><Phone size={15} /> +234 916 984 2001</a>
            <a href="mailto:reservations@bomsapartment.com">reservations@bomsapartment.com</a>
            <span>#3 Olaka Street, GRA Phase 3<br />Port Harcourt, Rivers State</span>
          </div>
          <div className="galaxy-footer__links">
            <a href="#destinations">Our rooms <ArrowUpRight size={14} /></a>
            <a href="#story">About us <ArrowUpRight size={14} /></a>
            <a href="/dashboard">Staff sign in <ArrowUpRight size={14} /></a>
          </div>
        </div>
        <div className="galaxy-footer__bottom">
          <span>© {currentYear} Boms Apartment</span>
          <span>Warmth, excellence, and a little room to breathe.</span>
        </div>
      </footer>
    </div>
  );
}
