// Mirrors backend/app/schemas.py.

export type User = { id: number; login: string; name: string | null; avatar_url: string | null };

export type RepoStatus = "queued" | "fetching" | "generating" | "ready" | "failed";

export type Repo = {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  status: RepoStatus;
  progress: number;
  status_detail: string | null;
  error: string | null;
  file_count: number;
  chunk_count: number;
  languages: Record<string, number>;
  question_count: number;
  created_at: string;
  ready_at: string | null;
};

export type Difficulty = "easy" | "medium" | "hard";

export type Question = {
  id: number;
  text: string;
  topic: string;
  difficulty: Difficulty;
  path: string | null;
  symbol: string | null;
  start_line: number | null;
  end_line: number | null;
};

export type Chunk = {
  id: number;
  path: string;
  language: string;
  kind: string;
  symbol: string | null;
  start_line: number;
  end_line: number;
  content: string;
};

export type QuestionDetail = Question & { reference_answer: string; chunk: Chunk | null };

export type Answer = {
  id: number;
  position: number;
  question: Question;
  code: Chunk | null;
  text: string | null;
  score: number | null;
  feedback: string | null;
  missed: string[];
  reference_answer: string | null;
  answered_at: string | null;
};

export type InterviewSession = {
  id: number;
  repo_id: number;
  repo_full_name: string;
  status: "active" | "completed";
  created_at: string;
  completed_at: string | null;
  answered: number;
  total: number;
  average: number | null;
  answers: Answer[];
};

export type Group = { name: string; answers: number; average: number };

export type Stats = {
  sessions: number;
  answers: number;
  average: number | null;
  by_topic: Group[];
  by_difficulty: Group[];
  by_repo: Group[];
  recent: { at: string; score: number; topic: string }[];
};

export const isWorking = (s: RepoStatus) => s === "queued" || s === "fetching" || s === "generating";
