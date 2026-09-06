// Header scroll state
const header = document.getElementById('site-header');
const onScroll = () => {
  if (window.scrollY > 24) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Scroll progress bar
const progressBar = document.getElementById('progress-bar');
const updateProgress = () => {
  const h = document.documentElement;
  const scrolled = h.scrollTop;
  const height = h.scrollHeight - h.clientHeight;
  progressBar.style.width = (height > 0 ? (scrolled / height) * 100 : 0) + '%';
};
updateProgress();
window.addEventListener('scroll', updateProgress, { passive: true });

// Mobile menu toggle
const menuToggle = document.getElementById('menu-toggle');
const siteNav = document.getElementById('site-nav');
menuToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  menuToggle.classList.toggle('open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
siteNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    menuToggle.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

// Scrollspy — highlight active nav link
const navLinks = document.querySelectorAll('[data-nav]');
const navSections = Array.from(navLinks).map((link) => document.querySelector(link.getAttribute('href')));
const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = '#' + entry.target.id;
        navLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === id);
        });
      }
    });
  },
  { threshold: 0.4, rootMargin: '-20% 0px -60% 0px' }
);
navSections.forEach((section) => section && spy.observe(section));

// Reveal-on-scroll
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
);
revealEls.forEach((el) => io.observe(el));

// Split-heading word reveal
document.querySelectorAll('[data-split]').forEach((heading) => {
  const words = heading.textContent.trim().split(/\s+/);
  heading.innerHTML = words
    .map((w) => `<span class="word"><span>${w}</span></span>`)
    .join(' ');
});
const splitIo = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const words = entry.target.querySelectorAll('.word > span');
        words.forEach((w, i) => {
          w.style.transitionDelay = `${i * 28}ms`;
        });
        entry.target.classList.add('is-visible');
        splitIo.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.3 }
);
document.querySelectorAll('.split-heading').forEach((el) => splitIo.observe(el));

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// ---------------- Interactive / luxury touches ----------------
const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (isFinePointer) {
  // Custom cursor: dot + ring + ambient glow
  const cursorDot = document.getElementById('cursor-dot');
  const cursorRing = document.getElementById('cursor-ring');
  const cursorGlow = document.getElementById('cursor-glow');

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = mouseX, ringY = mouseY;
  let glowX = mouseX, glowY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    cursorDot.classList.add('active');
    cursorRing.classList.add('active');
    cursorGlow.classList.add('active');
  });
  window.addEventListener('mouseleave', () => {
    cursorDot.classList.remove('active');
    cursorRing.classList.remove('active');
    cursorGlow.classList.remove('active');
  });

  const animateCursor = () => {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

    glowX += (mouseX - glowX) * 0.08;
    glowY += (mouseY - glowY) * 0.08;
    cursorGlow.style.transform = `translate(${glowX}px, ${glowY}px)`;

    requestAnimationFrame(animateCursor);
  };
  requestAnimationFrame(animateCursor);

  document.querySelectorAll('a, button, .tilt').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      cursorDot.classList.add('hovering');
      cursorRing.classList.add('hovering');
    });
    el.addEventListener('mouseleave', () => {
      cursorDot.classList.remove('hovering');
      cursorRing.classList.remove('hovering');
    });
  });

  // Hero parallax — subtle drift on mouse move
  const heroInner = document.getElementById('hero-inner');
  const heroBg = document.getElementById('hero-bg');
  const hero = document.getElementById('hero');
  if (hero) {
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      heroInner.style.transform = `translate(${px * -14}px, ${py * -10}px)`;
      heroBg.style.backgroundPosition = `${px * 20}px ${py * 20}px`;
    });
    hero.addEventListener('mouseleave', () => {
      heroInner.style.transform = 'translate(0, 0)';
    });
  }

  // Company card tilt + spotlight
  document.querySelectorAll('.company').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = x / rect.width - 0.5;
      const cy = y / rect.height - 0.5;
      card.style.transform = `perspective(800px) rotateX(${cy * -6}deg) rotateY(${cx * 8}deg) translateY(-4px)`;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });

  // Magnetic buttons
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * 0.25}px, ${y * 0.5}px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'translate(0, 0)';
    });
  });
}
