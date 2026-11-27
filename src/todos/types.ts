export interface Todo {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  subtaskCount: number;
  completedSubtaskCount: number;
}

export interface CreateTodo {
  title: string;
  description: string;
  parentId?: string | null;
}

export interface UpdateTodo {
  title?: string;
  description?: string;
  completed?: boolean;
  parentId?: string | null;
}

export interface ListTodos {
  completed?: boolean;
  /** Omitted: all tasks; null: roots; UUID: direct children. */
  parentId?: string | null;
  limit: number;
  offset: number;
}

export interface TodoPage {
  data: Todo[];
  pagination: { limit: number; offset: number; total: number };
}

/** Allows API tests to exercise HTTP behavior without a running database. */
export interface TodoRepository {
  list(options: ListTodos): Promise<TodoPage>;
  find(id: string): Promise<Todo | undefined>;
  create(input: CreateTodo): Promise<Todo>;
  update(id: string, input: UpdateTodo): Promise<Todo | undefined>;
  delete(id: string): Promise<boolean>;
  ping(): Promise<void>;
}
