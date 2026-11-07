<script setup lang="ts">
/**
 * A lazy capybara with a yuzu on his head, seen from the front, floating in water.
 * The parent puts a water layer in front of him, so his lower body is "under water".
 *   idle – eyes open, blinks now and then
 *   shy  – eyes shut + blush (someone is entering a secret code)
 *   sad  – wrong code: open eyes, little tear
 *   dive – jumps and dives head-first under the water
 */
defineProps<{ mood: 'idle' | 'shy' | 'sad' | 'dive' }>()
</script>

<template>
  <div class="capy" :class="mood" aria-hidden="true">
    <svg viewBox="0 0 140 150" class="body">
      <!-- shoulders (mostly under water) -->
      <ellipse cx="70" cy="132" rx="60" ry="30" fill="#9b6640" />
      <!-- ears -->
      <ellipse cx="34" cy="30" rx="10" ry="8" fill="#7a4c2c" transform="rotate(-25 34 30)" />
      <ellipse cx="106" cy="30" rx="10" ry="8" fill="#7a4c2c" transform="rotate(25 106 30)" />
      <ellipse cx="34" cy="31" rx="5" ry="4" fill="#5b3820" transform="rotate(-25 34 31)" />
      <ellipse cx="106" cy="31" rx="5" ry="4" fill="#5b3820" transform="rotate(25 106 31)" />
      <!-- head -->
      <path d="M22 66c0-30 21-44 48-44s48 14 48 44v20c0 22-20 34-48 34S22 108 22 86z" fill="#ac7346" />
      <path d="M34 50c6-14 20-20 36-20s30 6 36 20c-10-6-22-9-36-9s-26 3-36 9z" fill="#bf8656" opacity="0.7" />
      <!-- snout -->
      <rect x="40" y="70" width="60" height="42" rx="20" fill="#8c5733" />
      <ellipse cx="58" cy="80" rx="4" ry="2.6" fill="#3d2414" />
      <ellipse cx="82" cy="80" rx="4" ry="2.6" fill="#3d2414" />
      <path d="M62 96q8 6 16 0" stroke="#3d2414" stroke-width="2.4" fill="none" stroke-linecap="round" />
      <!-- cheeks -->
      <ellipse class="blush" cx="32" cy="76" rx="8" ry="5" fill="#ff8fa3" />
      <ellipse class="blush" cx="108" cy="76" rx="8" ry="5" fill="#ff8fa3" />
      <!-- eyes: open -->
      <g class="eyes-open">
        <g class="blink">
          <ellipse cx="46" cy="58" rx="4.6" ry="5.6" fill="#24150b" />
          <ellipse cx="94" cy="58" rx="4.6" ry="5.6" fill="#24150b" />
          <circle cx="47.6" cy="56" r="1.6" fill="#fff" />
          <circle cx="95.6" cy="56" r="1.6" fill="#fff" />
        </g>
        <path class="tear" d="M98 66q-3 6 0 8q3-2 0-8z" fill="#7cc7ff" />
      </g>
      <!-- eyes: closed (content little arcs) -->
      <g class="eyes-shut" stroke="#24150b" stroke-width="3" stroke-linecap="round" fill="none">
        <path d="M40 58q6 6 12 0" />
        <path d="M88 58q6 6 12 0" />
      </g>
      <!-- yuzu -->
      <g class="yuzu">
        <circle cx="70" cy="16" r="12" fill="#ffb02e" />
        <circle cx="66" cy="12" r="3" fill="#ffd27a" />
        <path d="M70 5q6-7 12-3q-5 5-12 3z" fill="#5bbf5f" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.capy { width: 112px; animation: bob 3.4s ease-in-out infinite; transform-origin: 50% 80%; }
.body { display: block; width: 100%; overflow: visible; }
@keyframes bob {
  0%, 100% { transform: translateY(0) rotate(-2.5deg); }
  50% { transform: translateY(5px) rotate(2.5deg); }
}

.blink { transform-box: fill-box; transform-origin: center; animation: blink 5s infinite; }
@keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
.eyes-shut, .tear { opacity: 0; }
.blush { opacity: 0.25; transition: opacity 0.3s; }
.eyes-open, .eyes-shut { transition: opacity 0.15s; }

.shy .eyes-open { opacity: 0; }
.shy .eyes-shut { opacity: 1; }
.shy .blush { opacity: 0.85; }
.shy .yuzu { animation: wobble 1.6s ease-in-out infinite; }

.sad .tear { opacity: 1; animation: tear 1.2s ease-in infinite; }
.sad .blink { animation: none; transform: scaleY(0.75); }
@keyframes tear { from { transform: translateY(-2px); opacity: 1; } to { transform: translateY(10px); opacity: 0; } }

.yuzu { transform-box: fill-box; transform-origin: 50% 100%; }
@keyframes wobble { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }

/* Dive: hop up, flip head-first, sink below the front water layer. */
.dive { animation: dive 1s cubic-bezier(.45,0,.55,1) forwards; }
.dive .eyes-open { opacity: 0; }
.dive .eyes-shut { opacity: 1; }
.dive .yuzu { animation: yuzu-fly 1s ease-out forwards; }
@keyframes dive {
  0% { transform: translateY(0) rotate(0); }
  18% { transform: translateY(10px) rotate(0) scaleY(0.9); }
  42% { transform: translateY(-78px) rotate(-12deg); }
  62% { transform: translateY(-60px) rotate(150deg); }
  88% { transform: translateY(90px) rotate(178deg); opacity: 1; }
  100% { transform: translateY(150px) rotate(180deg); opacity: 0; }
}
@keyframes yuzu-fly {
  0%, 30% { transform: translate(0, 0) rotate(0); }
  100% { transform: translate(40px, -60px) rotate(220deg); opacity: 0; }
}
</style>
