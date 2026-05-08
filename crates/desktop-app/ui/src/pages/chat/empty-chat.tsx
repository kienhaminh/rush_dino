/** Empty state shown when a conversation has no messages yet. */
export function EmptyChat() {
  return (
    <div className="chat-empty">
      <div className="chat-empty__eyebrow">FRESH SESSION</div>
      <h2 className="chat-empty__title">Run AI everywhere. Own your data.</h2>
      <p className="chat-empty__lede">
        RushDino runs locally on your machine. Start with a question, a task, or a paste of code —
        tool output streams into the same thread.
      </p>
    </div>
  )
}
