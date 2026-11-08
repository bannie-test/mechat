/** Default quick reactions; each user can change them in Settings. */
export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢']

export const ACCENTS = ['#2f88e8', '#7c5cff', '#e0457b', '#f0803c', '#2fb36a', '#13a8a8', '#d4a017', '#5f6b7a']

export const EMOJI_GROUPS: { key: string; icon: string; list: string[] }[] = [
  { key: 'smileys', icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖'.split(' ') },
  { key: 'gestures', icon: '👍', list: '👋 🤚 🖐 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🫶 👀 🧠 💋'.split(' ') },
  { key: 'hearts', icon: '❤️', list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎈 🎁 🏆 🥇'.split(' ') },
  { key: 'nature', icon: '🌱', list: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐠 🐬 🐳 🌱 🌿 🍀 🌵 🌴 🌳 🌸 🌼 🌻 🌹 🌷 🍁 🌈 ☀️ 🌙 ⛅ 🌧 ❄️'.split(' ') },
  { key: 'food', icon: '🍕', list: '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🌶 🌽 🥕 🍞 🧀 🍳 🍔 🍟 🍕 🌭 🌮 🍜 🍲 🍣 🍱 🍚 🍙 🍦 🍰 🎂 🍩 🍪 🍫 🍬 ☕ 🍵 🧋 🍺 🍻 🥂 🍷'.split(' ') },
  { key: 'activity', icon: '⚽', list: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🎮 🎲 🧩 🎯 🎳 🎸 🎹 🎤 🎧 🎬 📷 💻 📱 ⌚ 💡 📚 ✏️ 📌 🚗 🚲 ✈️ 🚀 🏠 🏖 ⛰ 🗺'.split(' ') },
]

/** Built-in sticker pack: big animated-feel emoji sent as kind = 'sticker'. */
export const STICKERS = '🥰 😂 😭 🤯 🥳 😎 🤔 😴 🙄 😡 🤗 😱 👍 👏 🙏 💪 🫶 ❤️ 🔥 🎉 💯 🌱 🐶 🐱 🐸 🐼 🦄 🍕 ☕ 🎂'.split(' ')
