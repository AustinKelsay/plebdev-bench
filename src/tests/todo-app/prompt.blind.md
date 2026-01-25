Build a todo list manager in TypeScript.

The manager should:
- Export a factory function that creates todo app instances
- Each todo should have a unique auto-incrementing ID, text, and completion status
- Support adding, retrieving, toggling, and deleting todos
- Support filtering todos (all, completed, pending)
- Support clearing all completed todos
- Ensure IDs are never reused after deletion
- Return copies of todos, not direct references to internal state
