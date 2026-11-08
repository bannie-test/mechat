<script setup lang="ts">
/**
 * A couldn't-care-less capybara chilling in a pool: slouched in a striped lifebuoy, huge black
 * shades on, one eyebrow up, smirking, a "yang lake" tattoo on the arm draped over the ring,
 * sipping a cocktail now and then. The parent puts water in front of the ring's lower half.
 *   idle – sips the cocktail; now and then lowers the shades to give you a bored look
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

      <!-- left arm lazily draped over the ring, "yang lake" tattooed on it -->
      <g class="mover">
        <path d="M72 120Q46 121 35 143" stroke="#9b6640" stroke-width="17" stroke-linecap="round" fill="none" />
        <path d="M70 116Q50 117 41 131" stroke="#b07a4c" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.5" />
        <ellipse cx="34" cy="148" rx="10" ry="7.5" fill="#8a5634" />
        <path d="M29 152v2.8M34 153v2.8M39 152v2.8" stroke="#5b3820" stroke-width="1.4" stroke-linecap="round" />
        <defs><path id="capy-tattoo-line" d="M37 139Q47 123 71 121" /></defs>
        <g class="tattoo">
          <path d="M63 113.5c-1.6-2.4-5-.6-3.2 1.9l3.2 3.2 3.2-3.2c1.8-2.5-1.6-4.3-3.2-1.9z" fill="#c0392b" opacity="0.85" />
          <text font-size="7.4" font-weight="800" font-family="'Brush Script MT', 'Segoe Script', cursive" fill="#1d2433" letter-spacing="0.2" opacity="0.88">
            <textPath href="#capy-tattoo-line" startOffset="6%">yang lake</textPath>
          </text>
        </g>
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
          <!-- lopsided smirk -->
          <path class="mouth" d="M58 98q10 4 22-3" stroke="#3d2414" stroke-width="2.4" fill="none" stroke-linecap="round" />
          <path class="mouth" d="M80 95l2.6-1.6" stroke="#3d2414" stroke-width="2" stroke-linecap="round" />
          <ellipse class="blush" cx="30" cy="80" rx="8" ry="5" fill="#ff8fa3" />
          <ellipse class="blush" cx="110" cy="80" rx="8" ry="5" fill="#ff8fa3" />

          <!-- bored half-lidded eyes, only seen when the shades come down -->
          <g class="eyes">
            <ellipse cx="46" cy="58" rx="4.6" ry="5.4" fill="#24150b" />
            <ellipse cx="94" cy="58" rx="4.6" ry="5.4" fill="#24150b" />
            <path d="M39 55.5h14M87 55.5h14" stroke="#ac7346" stroke-width="5" />
            <path d="M40 57.5h12M88 57.5h12" stroke="#5b3820" stroke-width="1.6" stroke-linecap="round" />
          </g>
          <path class="tear" d="M100 78q-3 6 0 8q3-2 0-8z" fill="#7cc7ff" />

          <!-- one eyebrow up: "and?" -->
          <g class="brows" stroke="#5b3820" stroke-width="3.2" stroke-linecap="round" fill="none">
            <path d="M34 40q10-3 20 1" />
            <path class="brow-up" d="M86 36q10-7 21-1" />
          </g>

          <!-- big black shades -->
          <g class="shades">
            <path d="M22 52h-6M118 52h6" stroke="#111318" stroke-width="3" stroke-linecap="round" />
            <path d="M20 46q0-4 4-4h38q5 0 5 5v6q0 15-21 15h-6q-20 0-20-14z" fill="#111318" />
            <path d="M73 47q0-5 5-5h38q4 0 4 4v4q0 14-20 14h-6q-21 0-21-15z" fill="#111318" />
            <path d="M66 47q4-4 8 0" stroke="#111318" stroke-width="4" fill="none" />
            <path d="M24 44h38M78 44h38" stroke="#3a3f4b" stroke-width="1.4" stroke-linecap="round" />
            <g class="glint">
              <path d="M28 60l12-14M34 62l9-11" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0.55" />
              <path d="M82 60l12-14" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0.4" />
            </g>
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
            <path d="M149 84V70C149 59 133 58 124 72C117 84 110 96 103 103" stroke="#29b6f6" stroke-width="3.2" stroke-linecap="round" fill="none" />
            <path d="M149 84V70C149 59 133 58 124 72C117 84 110 96 103 103" stroke="#fff" stroke-width="3.2" stroke-dasharray="3 4" opacity="0.8" fill="none" />
            <!-- accordion bend -->
            <path d="M146.6 66.5h5M146 63.8h5.6M144.6 61.4h5.4" stroke="#0288d1" stroke-width="1" opacity="0.6" />
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
  0%, 100% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(4px) rotate(-1deg); }
}

.mover, .arm, .ring { transform-box: view-box; }
.mover { transform-origin: 100px 110px; }
.arm { transform-origin: 138px 130px; transform: rotate(14deg); }

.eyes, .shades, .brow-up, .glint { transform-box: fill-box; }
.shades { transform-origin: 50% 0; transition: transform 0.3s var(--ease-out, ease); }
.brow-up { transform-origin: 0 100%; }
.tear { opacity: 0; }
.blush { opacity: 0; transition: opacity 0.3s; }
.fizz { opacity: 0; }
.glint { animation: glint 6s ease-in-out infinite; }
@keyframes glint { 0%, 80%, 100% { transform: translateX(0); opacity: 1; } 88% { transform: translateX(8px); opacity: 0.2; } }

/* idle: a lazy sip every 7 s; every other beat he lowers the shades and gives you a bored look. */
.idle .arm { animation: sip 7s ease-in-out infinite; }
.idle .fizz { animation: fizz 7s ease-in-out infinite; }
.idle .drink { transform-box: fill-box; transform-origin: 50% 100%; animation: drink 7s ease-in-out infinite; }
.idle .shades { animation: peek 14s ease-in-out infinite; }
.idle .brow-up { animation: brow 14s ease-in-out infinite; }
@keyframes sip { 0%, 55% { transform: rotate(14deg); } 63%, 80% { transform: rotate(0deg); } 88%, 100% { transform: rotate(14deg); } }
@keyframes fizz { 0%, 62% { opacity: 0; transform: translateY(0); } 70% { opacity: 1; } 80% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 0; } }
@keyframes drink { 0%, 62% { transform: scaleY(1); } 80%, 100% { transform: scaleY(0.88); } }
@keyframes peek { 0%, 20%, 38%, 100% { transform: translateY(0); } 24%, 34% { transform: translateY(13px); } }
@keyframes brow { 0%, 20%, 38%, 100% { transform: translateY(0); } 24%, 34% { transform: translateY(-3px) rotate(-6deg); } }

/* shy: blush, look away, shades firmly on */
.shy .blush { opacity: 0.9; }
.shy .arm { transform: rotate(22deg); transition: transform 0.4s; }
.shy .brow-up { transform: translateY(3px) rotate(8deg); }

/* sad: shades slip down a bit, a tear rolls out from under them */
.sad .shades { transform: translateY(5px) rotate(-3deg); }
.sad .tear { opacity: 1; animation: tear 1.2s ease-in infinite; }
@keyframes tear { from { transform: translateY(-2px); opacity: 1; } to { transform: translateY(10px); opacity: 0; } }

/* dive: hop out of the ring, flip, sink below the water in front. The ring stays. */
.dive .mover { animation: dive 1s cubic-bezier(.45, 0, .55, 1) forwards; }
.dive .arm { transform: rotate(0deg); }
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
