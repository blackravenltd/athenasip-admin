import EventEmitter from 'eventemitter3'

const eventCore = new EventEmitter()

export default function useAppEvents() {
  return eventCore
}
