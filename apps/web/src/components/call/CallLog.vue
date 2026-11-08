<script setup lang="ts">
/** Body of a `kind: 'call'` message: "Outgoing video call · 3:12" with a call-back / join button. */
import { computed } from 'vue'
import { formatDuration } from '@/lib/format'
import { callLogInfo } from '@/lib/call/labels'
import type { ChatType, Message } from '@/lib/types'
import { useCall } from '@/stores/call'
import Icon from '@/components/Icon.vue'

const props = defineProps<{ msg: Message; mine: boolean; chatType: ChatType }>()
const call = useCall()

const info = computed(() => callLogInfo(props.msg, props.mine, props.chatType === 'group'))
const here = computed(() => call.inCall && call.chatId === props.msg.chat_id)
const joinable = computed(() => info.value.live && !!call.liveCall(props.msg.chat_id) && !here.value)

function go() {
  void call.start(props.msg.chat_id, info.value.video ? 'video' : 'voice')
}
</script>

<template>
  <div class="call-log">
    <span class="ic" :class="{ missed: info.missed, live: info.live }"><Icon :name="info.video ? 'videocam' : 'phone'" :size="22" /></span>
    <span class="txt">
      <b>{{ $t(info.key) }}</b>
      <small :class="{ missed: info.missed }">
        <Icon :name="info.missed ? 'callMissed' : info.outgoing ? 'callMade' : 'callReceived'" :size="14" />
        <template v-if="info.live">{{ here ? $t('call.youAreIn') : $t('call.inProgress') }}</template>
        <template v-else-if="info.duration">{{ formatDuration(info.duration) }}</template>
        <template v-else>{{ $t(info.video ? 'call.video' : 'call.voice') }}</template>
      </small>
    </span>
    <button v-if="joinable" class="join" data-no-swipe @click.stop="go">{{ $t('call.join') }}</button>
    <button v-else-if="!info.live" class="again" data-no-swipe :title="$t('call.callBack')" @click.stop="go">
      <Icon :name="info.video ? 'videocam' : 'phone'" :size="20" />
    </button>
  </div>
</template>

<style scoped>
.call-log { display: flex; align-items: center; gap: 10px; min-width: 210px; padding: 2px 0 4px; }
.ic { flex: none; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--accent); }
.ic.missed { background: var(--danger); }
.ic.live { background: #2fb36a; animation: live 1.6s ease-in-out infinite; }
@keyframes live { 50% { box-shadow: 0 0 0 6px rgba(47, 179, 106, 0.25); } }
.txt { flex: 1; min-width: 0; display: grid; text-align: left; }
.txt b { font-size: 15px; }
.txt small { display: inline-flex; align-items: center; gap: 3px; font-size: 13px; opacity: 0.75; }
.txt small.missed { color: var(--danger); opacity: 1; }
.again { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: var(--accent); }
.again:hover { background: var(--hover); }
.join { flex: none; padding: 6px 14px; border-radius: 16px; background: #2fb36a; color: #fff; font-weight: 700; font-size: 14px; }
</style>
