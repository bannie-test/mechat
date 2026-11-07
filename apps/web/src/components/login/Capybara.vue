<script setup lang="ts">
/**
 * A capybara chilling in a pool: sitting in a striped lifebuoy, sunglasses pushed up,
 * sipping a cocktail now and then. The parent puts water in front of the ring's lower half.
 *   idle – sips the cocktail every few seconds (eyes close blissfully while sipping)
 *   shy  – eyes shut + blush, stops sipping (someone is entering a secret code)
 *   sad  – wrong code: eyes open, a little tear
 *   dive – hops out of the ring and dives head-first; the ring stays floating
 */
defineProps<{ mood: 'idle' | 'shy' | 'sad' | 'dive' }>()
</script>

<template>
  <div class="capy" :class="mood" aria-hidden="true">
    <svg viewBox="0 0 200 190" class="art">
      <defs>
        <clipPath id="capy-front"><rect x="0" y="136" width="200" height="60" /></clipPath>
        <linearGradient id="capy-drink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff6f9c" />
          <stop offset="1" stop-color="#ffb35c" />
        </linearGradient>
        <g id="capy-ring">
          <ellipse cx="100" cy="136" rx="62" ry="19" fill="none" stroke="#fdfdfd" stroke-width="18" />
          <ellipse cx="100" cy="136" rx="62" ry="19" fill="none" stroke="#f05252" stroke-width="18" stroke-dasharray="34.1 34.1" stroke-dashoffset="17" />
          <ellipse cx="100" cy="136" rx="53" ry="10.5" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="2.5" />
          <ellipse cx="100" cy="133" rx="66" ry="22" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-dasharray="70 400" stroke-dashoffset="-160" />
        </g>
      </defs>

      <!-- ring (back half shows behind him) -->
      <use href="#capy-ring" class="ring" />

      <!-- chest, inside the ring -->
      <ellipse class="mover" cx="100" cy="134" rx="42" ry="26" fill="#9b6640" />

      <!-- ring front half, over his belly -->
      <use href="#capy-ring" class="ring" clip-path="url(#capy-front)" />

      <!-- left arm draped over the ring -->
      <g class="mover">
        <path d="M68 126Q52 132 50 147" stroke="#9b6640" stroke-width="13" stroke-linecap="round" fill="none" />
        <ellipse cx="49" cy="150" rx="8.5" ry="6.5" fill="#8a5634" />
        <path d="M45 153v2.5M49 154v2.5M53 153v2.5" stroke="#5b3820" stroke-width="1.3" stroke-linecap="round" />
      </g>

      <!-- head -->
      <g class="mover">
        <g transform="translate(30 2)">
          <ellipse cx="34" cy="30" rx="10" ry="8" fill="#7a4c2c" transform="rotate(-25 34 30)" />
          <ellipse cx="106" cy="30" rx="10" ry="8" fill="#7a4c2c" transform="rotate(25 106 30)" />
          <ellipse cx="34" cy="31" rx="5" ry="4" fill="#5b3820" transform="rotate(-25 34 31)" />
          <ellipse cx="106" cy="31" rx="5" ry="4" fill="#5b3820" transform="rotate(25 106 31)" />
          <path d="M22 66c0-30 21-44 48-44s48 14 48 44v20c0 22-20 34-48 34S22 108 22 86z" fill="#ac7346" />
          <path d="M34 50c6-14 20-20 36-20s30 6 36 20c-10-6-22-9-36-9s-26 3-36 9z" fill="#bf8656" opacity="0.7" />
          <rect x="40" y="70" width="60" height="42" rx="20" fill="#8c5733" />
          <ellipse cx="58" cy="80" rx="4" ry="2.6" fill="#3d2414" />
          <ellipse cx="82" cy="80" rx="4" ry="2.6" fill="#3d2414" />
          <path d="M62 96q8 6 16 0" stroke="#3d2414" stroke-width="2.4" fill="none" stroke-linecap="round" />
          <ellipse class="blush" cx="32" cy="76" rx="8" ry="5" fill="#ff8fa3" />
          <ellipse class="blush" cx="108" cy="76" rx="8" ry="5" fill="#ff8fa3" />
          <g class="eyes-open">
            <g class="blink">
              <ellipse cx="46" cy="58" rx="4.6" ry="5.6" fill="#24150b" />
              <ellipse cx="94" cy="58" rx="4.6" ry="5.6" fill="#24150b" />
              <circle cx="47.6" cy="56" r="1.6" fill="#fff" />
              <circle cx="95.6" cy="56" r="1.6" fill="#fff" />
            </g>
            <path class="tear" d="M98 66q-3 6 0 8q3-2 0-8z" fill="#7cc7ff" />
          </g>
          <g class="eyes-shut" stroke="#24150b" stroke-width="3" stroke-linecap="round" fill="none">
            <path d="M40 58q6 6 12 0" />
            <path d="M88 58q6 6 12 0" />
          </g>
          <!-- sunglasses pushed up on his head -->
          <g class="shades">
            <path d="M50 36h-10M90 36h10" stroke="#2b2f3a" stroke-width="2" stroke-linecap="round" />
            <rect x="50" y="31" width="18" height="11" rx="4.5" fill="#2b2f3a" />
            <rect x="72" y="31" width="18" height="11" rx="4.5" fill="#2b2f3a" />
            <path d="M68 35q2-2.5 4 0" stroke="#2b2f3a" stroke-width="2" fill="none" />
            <path d="M53 34l5-1M75 34l5-1" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.6" />
          </g>
        </g>
      </g>

      <!-- right arm with the cocktail -->
      <g class="mover">
        <g class="arm">
          <path d="M132 128Q146 122 150 108" stroke="#9b6640" stroke-width="13" stroke-linecap="round" fill="none" />
          <g class="glass">
            <line x1="160" y1="76" x2="168" y2="59" stroke="#c49a6c" stroke-width="1.4" />
            <path d="M158 61Q168 47 179 59Z" fill="#ffd23f" />
            <path d="M168 54l.6 6.5M163 57.5l3 3M174 56.5l-2.5 3.5" stroke="#eda200" stroke-width="1" />
            <path d="M135 70h34l-17 20z" fill="rgba(215,238,255,0.55)" stroke="rgba(255,255,255,0.95)" stroke-width="1.5" stroke-linejoin="round" />
            <path class="drink" d="M138.5 73h27L152 88z" fill="url(#capy-drink)" />
            <g class="fizz" fill="#fff">
              <circle cx="149" cy="84" r="1.3" /><circle cx="155" cy="82" r="1" /><circle cx="152" cy="79" r="1.2" />
            </g>
            <line x1="152" y1="90" x2="152" y2="103" stroke="rgba(255,255,255,0.95)" stroke-width="2.4" />
            <ellipse cx="152" cy="104" rx="7" ry="2" fill="rgba(255,255,255,0.95)" />
            <path d="M149 82L108 99" stroke="#29b6f6" stroke-width="3.2" stroke-linecap="round" />
            <path d="M149 82L108 99" stroke="#fff" stroke-width="3.2" stroke-dasharray="3 4" opacity="0.8" />
            <circle cx="135.5" cy="70" r="6" fill="#9be15d" stroke="#6cbf3a" stroke-width="1.5" />
            <path d="M135.5 64v12M130 70h11" stroke="#d9f7bf" stroke-width="1" />
          </g>
          <circle cx="151" cy="104" r="7.5" fill="#8a5634" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.capy { width: 150px; animation: bob 4.2s ease-in-out infinite; transform-origin: 50% 75%; }
.art { display: block; width: 100%; overflow: visible; }
@keyframes bob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(4px) rotate(2deg); }
}

.mover, .arm, .ring { transform-box: view-box; }
.mover { transform-origin: 100px 110px; }
.arm { transform-origin: 138px 130px; transform: rotate(14deg); }

.blink { transform-box: fill-box; transform-origin: center; animation: blink 5s infinite; }
@keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
.eyes-open, .eyes-shut { transition: opacity 0.15s; }
.eyes-shut, .tear { opacity: 0; }
.blush { opacity: 0.25; transition: opacity 0.3s; }
.fizz { opacity: 0; }

/* idle: a lazy sip every 7 s – the arm brings the straw to his mouth and his eyes close. */
.idle .arm { animation: sip 7s ease-in-out infinite; }
.idle .eyes-open { animation: sip-open 7s ease-in-out infinite; }
.idle .eyes-shut { animation: sip-shut 7s ease-in-out infinite; }
.idle .fizz { animation: fizz 7s ease-in-out infinite; }
.idle .drink { transform-box: fill-box; transform-origin: 50% 100%; animation: drink 7s ease-in-out infinite; }
@keyframes sip { 0%, 55% { transform: rotate(14deg); } 63%, 80% { transform: rotate(0deg); } 88%, 100% { transform: rotate(14deg); } }
@keyframes sip-open { 0%, 60%, 84%, 100% { opacity: 1; } 63%, 80% { opacity: 0; } }
@keyframes sip-shut { 0%, 60%, 84%, 100% { opacity: 0; } 63%, 80% { opacity: 1; } }
@keyframes fizz { 0%, 62% { opacity: 0; transform: translateY(0); } 70% { opacity: 1; } 80% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 0; } }
@keyframes drink { 0%, 62% { transform: scaleY(1); } 80%, 100% { transform: scaleY(0.88); } }

.shy .eyes-open { opacity: 0; }
.shy .eyes-shut { opacity: 1; }
.shy .blush { opacity: 0.9; }
.shy .arm { transform: rotate(22deg); transition: transform 0.4s; }

.sad .tear { opacity: 1; animation: tear 1.2s ease-in infinite; }
.sad .blink { animation: none; transform: scaleY(0.75); }
@keyframes tear { from { transform: translateY(-2px); opacity: 1; } to { transform: translateY(10px); opacity: 0; } }

/* dive: hop out of the ring, flip, sink below the water in front. The ring stays. */
.dive .mover { animation: dive 1s cubic-bezier(.45, 0, .55, 1) forwards; }
.dive .arm { transform: rotate(0deg); }
.dive .eyes-open { opacity: 0; }
.dive .eyes-shut { opacity: 1; }
.dive .ring { animation: ring-bob 1.2s ease-out; }
@keyframes dive {
  0% { transform: translateY(0) rotate(0); }
  18% { transform: translateY(8px) rotate(0) scaleY(0.92); }
  42% { transform: translateY(-84px) rotate(-12deg); }
  62% { transform: translateY(-62px) rotate(150deg); }
  88% { transform: translateY(96px) rotate(178deg); opacity: 1; }
  100% { transform: translateY(150px) rotate(180deg); opacity: 0; }
}
@keyframes ring-bob { 0%, 15% { transform: translateY(0); } 30% { transform: translateY(5px); } 55% { transform: translateY(-3px); } 100% { transform: translateY(0); } }
</style>
