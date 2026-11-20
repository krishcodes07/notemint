const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

export interface HealthResponse {
  status: string;
  service: string;
}

export interface MeResponse {
  user_id: string;
  authenticated: boolean;
}

export interface UserProfileResponse {
  clerk_user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
}

export interface DocumentResponse {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  status: "uploaded" | "extracting" | "generating" | "completed" | "failed";
  page_count: number | null;
  created_at: string;
}

export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface DocumentDeleteResponse {
  id: string;
  deleted: boolean;
  message: string;
}

export interface ExtractionQuality {
  is_scanned: boolean;
  ocr_required: boolean;
  empty_pages: number[];
  low_text_pages: number[];
  extraction_success: boolean;
  reason: string | null;
}

export interface DocumentExtractionResponse {
  document_id: string;
  document_status: "uploaded" | "extracting" | "generating" | "completed" | "failed";
  extraction_status: "pending" | "extracting" | "completed" | "failed" | null;
  page_count: number | null;
  total_characters: number;
  is_scanned: boolean;
  quality: ExtractionQuality | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DocumentReprocessResponse {
  document_id: string;
  document_status: "uploaded" | "extracting" | "generating" | "completed" | "failed";
  message: string;
  enqueued: boolean;
}

/** Returns the current Clerk session token, or null when signed out. */
export type GetSessionToken = () => Promise<string | null>;

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The backend could not be reached at all (network / server down). */
export class BackendUnavailableError extends ApiError {
  constructor(message = "Backend is unreachable. Make sure the API server is running.") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

/** The backend rejected the session token (missing, expired, or invalid). */
export class UnauthorizedError extends ApiError {
  constructor(
    message = "Your session is invalid or has expired. Please sign in again.",
  ) {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: { token?: string },
): Promise<T> {
  let response: Response;

  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...init?.headers,
      },
    });
  } catch {
    throw new BackendUnavailableError();
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}.`;
    try {
      const errorJson = await response.json();
      if (errorJson && typeof errorJson.detail === "string") {
        errorMessage = errorJson.detail;
      }
    } catch {
      // Keep default error message
    }
    throw new ApiError(errorMessage, response.status);
  }

  return (await response.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/v1/health");
}

/**
 * Perform an authenticated request. Attaches `Authorization: Bearer <token>`
 * using the provided session-token getter (Clerk's `getToken`). Tokens are
 * never stored — they live in Clerk's session and are fetched on demand.
 */
export async function authenticatedRequest<T>(
  path: string,
  getSessionToken: GetSessionToken,
  init?: RequestInit,
): Promise<T> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to make this request.");
  }
  return request<T>(path, init, { token });
}

/** GET /api/v1/auth/me — returns the backend-verified identity. */
export function getMe(getSessionToken: GetSessionToken): Promise<MeResponse> {
  return authenticatedRequest<MeResponse>("/api/v1/auth/me", getSessionToken);
}

/**
 * GET /api/v1/users/me — returns (and creates if first visit) the signed-in
 * user's application profile from the database.
 */
export function getUserProfile(
  getSessionToken: GetSessionToken,
): Promise<UserProfileResponse> {
  return authenticatedRequest<UserProfileResponse>(
    "/api/v1/users/me",
    getSessionToken,
  );
}

/**
 * POST /api/v1/documents — uploads a PDF file with real upload progress tracking.
 */
export function uploadDocument(
  file: File,
  getSessionToken: GetSessionToken,
  onProgress?: (percent: number) => void,
): Promise<DocumentResponse> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) {
          throw new UnauthorizedError("You must be signed in to upload documents.");
        }

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}/api/v1/documents`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        if (onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
              onProgress(percent);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status === 201 || xhr.status === 200) {
            try {
              const data = JSON.parse(xhr.responseText) as DocumentResponse;
              resolve(data);
            } catch {
              reject(new ApiError("Failed to parse server response", xhr.status));
            }
          } else if (xhr.status === 401) {
            reject(new UnauthorizedError());
          } else {
            let detail = `Upload failed with status ${xhr.status}`;
            try {
              const err = JSON.parse(xhr.responseText);
              if (err?.detail) detail = err.detail;
            } catch {
              // fallback
            }
            reject(new ApiError(detail, xhr.status));
          }
        };

        xhr.onerror = () => {
          reject(new BackendUnavailableError());
        };

        xhr.send(formData);
      } catch (err) {
        reject(err);
      }
    })();
  });
}

/**
 * GET /api/v1/documents — lists documents owned by the user.
 */
export function getDocuments(
  getSessionToken: GetSessionToken,
  params?: { limit?: number; offset?: number },
): Promise<DocumentListResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : "";

  return authenticatedRequest<DocumentListResponse>(
    `/api/v1/documents${qs}`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId} — gets document metadata.
 */
export function getDocument(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentResponse> {
  return authenticatedRequest<DocumentResponse>(
    `/api/v1/documents/${documentId}`,
    getSessionToken,
  );
}

/**
 * DELETE /api/v1/documents/{documentId} — deletes document and stored file.
 */
export function deleteDocument(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentDeleteResponse> {
  return authenticatedRequest<DocumentDeleteResponse>(
    `/api/v1/documents/${documentId}`,
    getSessionToken,
    { method: "DELETE" },
  );
}

/**
 * GET /api/v1/documents/{documentId}/file — streams the original PDF file as a Blob.
 */
export async function getDocumentFileBlob(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<Blob> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to access this document file.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/file`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new BackendUnavailableError();
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let detail = `Failed to retrieve document file (${response.status})`;
    try {
      const err = await response.json();
      if (err?.detail) detail = err.detail;
    } catch {
      // fallback
    }
    throw new ApiError(detail, response.status);
  }

  return response.blob();
}

/**
 * GET /api/v1/documents/{documentId}/extraction — retrieves extraction status and diagnostics.
 */
export function getDocumentExtraction(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentExtractionResponse> {
  return authenticatedRequest<DocumentExtractionResponse>(
    `/api/v1/documents/${documentId}/extraction`,
    getSessionToken,
  );
}

/**
 * POST /api/v1/documents/{documentId}/reprocess — triggers extraction reprocessing.
 */
export function reprocessDocument(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentReprocessResponse> {
  return authenticatedRequest<DocumentReprocessResponse>(
    `/api/v1/documents/${documentId}/reprocess`,
    getSessionToken,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Phase 7: AI Generation Types & Endpoints
// ---------------------------------------------------------------------------

export type StudyResourceType =
  | "notes"
  | "questions"
  | "flashcards"
  | "quiz"
  | "summary";

export type StudyResourceStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed";

export interface NoteSection {
  heading: string;
  content: string;
  key_points: string[];
  source_pages: number[];
}

export interface KeyTerm {
  term: string;
  definition: string;
  source_pages: number[];
}

export interface NotesContent {
  title: string;
  overview: string;
  sections: NoteSection[];
  key_terms?: KeyTerm[];
}

export interface QuestionItem {
  id: string;
  question: string;
  answer: string;
  answer_type: "very_short" | "short" | "long";
  difficulty: "easy" | "medium" | "hard";
  source_pages: number[];
  important_points?: string[];
}

export interface QuestionsContent {
  title: string;
  questions: QuestionItem[];
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  difficulty: "easy" | "medium" | "hard";
  source_pages: number[];
}

export interface FlashcardsContent {
  title: string;
  cards: FlashcardItem[];
}

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
  source_pages: number[];
  correct_option_index?: number;
  explanation?: string;
}

export interface QuizContent {
  title: string;
  questions: QuizQuestionItem[];
}

export interface TopicSummary {
  topic: string;
  summary: string;
  source_pages: number[];
}

export interface SummaryContent {
  title: string;
  overview: string;
  main_topics: TopicSummary[];
  key_takeaways: string[];
  revision_summary: string;
}

export interface StudyResourceResponse {
  id: string;
  document_id: string;
  resource_type: StudyResourceType;
  status: StudyResourceStatus;
  content: Record<string, unknown> | null;
  model_name: string;
  prompt_version: string;
  version: number;
  is_active: boolean;
  input_tokens: number | null;
  output_tokens: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyResourceJobResponse {
  resource_id: string;
  resource_type: StudyResourceType;
  status: StudyResourceStatus;
  version: number;
  is_active: boolean;
}

export interface GenerateResourcesResponse {
  document_id: string;
  enqueued_count: number;
  message: string;
  jobs: StudyResourceJobResponse[];
}

export interface GenerationStatusItem {
  resource_id: string | null;
  status: StudyResourceStatus | "not_started";
  version: number;
  is_active: boolean;
  error_message: string | null;
  updated_at: string | null;
}

export interface DocumentGenerationStatusResponse {
  document_id: string;
  document_status: string;
  resources: Record<StudyResourceType, GenerationStatusItem>;
}

export interface QuestionGradeResult {
  question_id: string;
  question: string;
  options: string[];
  selected_option_index: number | null;
  correct_option_index: number;
  is_correct: boolean;
  explanation: string;
  source_pages: number[];
}

export interface QuizSubmissionResponse {
  resource_id: string;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  score_percentage: number;
  results: QuestionGradeResult[];
  attempt_id?: string;
  completed_at?: string;
}

/**
 * POST /api/v1/documents/{documentId}/generate — initiates generation for selected resource types.
 */
export function generateStudyResources(
  documentId: string,
  resourceTypes: StudyResourceType[],
  getSessionToken: GetSessionToken,
): Promise<GenerateResourcesResponse> {
  return authenticatedRequest<GenerateResourcesResponse>(
    `/api/v1/documents/${documentId}/generate`,
    getSessionToken,
    {
      method: "POST",
      body: JSON.stringify({ resource_types: resourceTypes }),
    },
  );
}

/**
 * GET /api/v1/documents/{documentId}/resources — lists all active study resources for a document.
 */
export function getStudyResources(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<StudyResourceResponse[]> {
  return authenticatedRequest<StudyResourceResponse[]>(
    `/api/v1/documents/${documentId}/resources`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId}/resources/{resourceId} — retrieves a single study resource.
 */
export function getStudyResource(
  documentId: string,
  resourceId: string,
  getSessionToken: GetSessionToken,
): Promise<StudyResourceResponse> {
  return authenticatedRequest<StudyResourceResponse>(
    `/api/v1/documents/${documentId}/resources/${resourceId}`,
    getSessionToken,
  );
}

/**
 * POST /api/v1/documents/{documentId}/resources/{resourceType}/regenerate — regenerates a resource.
 */
export function regenerateStudyResource(
  documentId: string,
  resourceType: StudyResourceType,
  getSessionToken: GetSessionToken,
): Promise<StudyResourceJobResponse> {
  return authenticatedRequest<StudyResourceJobResponse>(
    `/api/v1/documents/${documentId}/resources/${resourceType}/regenerate`,
    getSessionToken,
    { method: "POST" },
  );
}

/**
 * GET /api/v1/documents/{documentId}/generation-status — polls generation progress.
 */
export function getDocumentGenerationStatus(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentGenerationStatusResponse> {
  return authenticatedRequest<DocumentGenerationStatusResponse>(
    `/api/v1/documents/${documentId}/generation-status`,
    getSessionToken,
  );
}

/**
 * POST /api/v1/documents/{documentId}/quiz/{resourceId}/submit — submits quiz answers for server-side grading.
 */
export function submitQuizAnswers(
  documentId: string,
  resourceId: string,
  answers: Record<string, number>,
  getSessionToken: GetSessionToken,
): Promise<QuizSubmissionResponse> {
  return authenticatedRequest<QuizSubmissionResponse>(
    `/api/v1/documents/${documentId}/quiz/${resourceId}/submit`,
    getSessionToken,
    {
      method: "POST",
      body: JSON.stringify({ answers }),
    },
  );
}

// =============================================================================
// Phase 8: Study Workspace, Mastery, Bookmarks, Quiz History & Search
// =============================================================================

export interface FlashcardProgressItem {
  id: string;
  clerk_user_id: string;
  document_id: string;
  resource_id: string;
  card_id: string;
  mastery_level: number; // 0..3
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlashcardProgressListResponse {
  document_id: string;
  resource_id: string | null;
  total_cards: number;
  reviewed_cards: number;
  mastered_cards: number;
  learning_cards: number;
  items: FlashcardProgressItem[];
}

export interface QuestionBookmarkResponse {
  id: string;
  clerk_user_id: string;
  document_id: string;
  resource_id: string;
  question_id: string;
  created_at: string;
}

export interface QuestionBookmarkDeleteResponse {
  id: string;
  deleted: boolean;
  message: string;
}

export interface QuizAttemptSummary {
  id: string;
  document_id: string;
  resource_id: string;
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  completed_at: string;
}

export interface QuizAttemptDetail {
  id: string;
  document_id: string;
  resource_id: string;
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  submitted_answers: Record<string, number>;
  graded_result: QuestionGradeResult[];
  completed_at: string;
}

export interface StudyProgressOverview {
  document_id: string;
  total_flashcards: number;
  reviewed_flashcards: number;
  mastered_flashcards: number;
  learning_flashcards: number;
  bookmarked_questions_count: number;
  quiz_attempts_count: number;
  latest_quiz_score: number | null;
  best_quiz_score: number | null;
  last_studied_at: string | null;
}

export interface SearchResultItem {
  resource_type: "notes" | "summary" | "questions" | "flashcards" | "quiz";
  title: string;
  snippet: string;
  match_field: string;
  target_id: string | null;
  source_pages: number[];
}

export interface DocumentSearchResponse {
  document_id: string;
  query: string;
  total_results: number;
  results: SearchResultItem[];
}

/**
 * GET /api/v1/documents/{documentId}/flashcard-progress — gets saved progress for flashcards.
 */
export function getFlashcardProgress(
  documentId: string,
  getSessionToken: GetSessionToken,
  resourceId?: string,
): Promise<FlashcardProgressListResponse> {
  const query = resourceId ? `?resource_id=${encodeURIComponent(resourceId)}` : "";
  return authenticatedRequest<FlashcardProgressListResponse>(
    `/api/v1/documents/${documentId}/flashcard-progress${query}`,
    getSessionToken,
  );
}

/**
 * PUT /api/v1/documents/{documentId}/flashcards/{resourceId}/{cardId}/progress — records flashcard outcome.
 */
export function updateFlashcardProgress(
  documentId: string,
  resourceId: string,
  cardId: string,
  result: "known" | "learning" | "again",
  getSessionToken: GetSessionToken,
): Promise<FlashcardProgressItem> {
  return authenticatedRequest<FlashcardProgressItem>(
    `/api/v1/documents/${documentId}/flashcards/${resourceId}/${cardId}/progress`,
    getSessionToken,
    {
      method: "PUT",
      body: JSON.stringify({ result }),
    },
  );
}

/**
 * GET /api/v1/documents/{documentId}/bookmarks — lists saved question bookmarks.
 */
export function getQuestionBookmarks(
  documentId: string,
  getSessionToken: GetSessionToken,
  resourceId?: string,
): Promise<QuestionBookmarkResponse[]> {
  const query = resourceId ? `?resource_id=${encodeURIComponent(resourceId)}` : "";
  return authenticatedRequest<QuestionBookmarkResponse[]>(
    `/api/v1/documents/${documentId}/bookmarks${query}`,
    getSessionToken,
  );
}

/**
 * POST /api/v1/documents/{documentId}/bookmarks — bookmarks a question.
 */
export function createQuestionBookmark(
  documentId: string,
  resourceId: string,
  questionId: string,
  getSessionToken: GetSessionToken,
): Promise<QuestionBookmarkResponse> {
  return authenticatedRequest<QuestionBookmarkResponse>(
    `/api/v1/documents/${documentId}/bookmarks`,
    getSessionToken,
    {
      method: "POST",
      body: JSON.stringify({ resource_id: resourceId, question_id: questionId }),
    },
  );
}

/**
 * DELETE /api/v1/documents/{documentId}/bookmarks/{bookmarkId} — removes a question bookmark.
 */
export function deleteQuestionBookmark(
  documentId: string,
  bookmarkId: string,
  getSessionToken: GetSessionToken,
): Promise<QuestionBookmarkDeleteResponse> {
  return authenticatedRequest<QuestionBookmarkDeleteResponse>(
    `/api/v1/documents/${documentId}/bookmarks/${bookmarkId}`,
    getSessionToken,
    { method: "DELETE" },
  );
}

/**
 * GET /api/v1/documents/{documentId}/quiz-attempts — retrieves completed quiz attempt history.
 */
export function getQuizAttempts(
  documentId: string,
  getSessionToken: GetSessionToken,
  resourceId?: string,
): Promise<QuizAttemptSummary[]> {
  const query = resourceId ? `?resource_id=${encodeURIComponent(resourceId)}` : "";
  return authenticatedRequest<QuizAttemptSummary[]>(
    `/api/v1/documents/${documentId}/quiz-attempts${query}`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId}/quiz-attempts/{attemptId} — retrieves a specific quiz attempt with review data.
 */
export function getQuizAttempt(
  documentId: string,
  attemptId: string,
  getSessionToken: GetSessionToken,
): Promise<QuizAttemptDetail> {
  return authenticatedRequest<QuizAttemptDetail>(
    `/api/v1/documents/${documentId}/quiz-attempts/${attemptId}`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId}/study-progress — retrieves overall aggregated study metrics.
 */
export function getStudyProgressOverview(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<StudyProgressOverview> {
  return authenticatedRequest<StudyProgressOverview>(
    `/api/v1/documents/${documentId}/study-progress`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId}/search — searches across generated study resources.
 */
export function searchStudyResources(
  documentId: string,
  query: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentSearchResponse> {
  return authenticatedRequest<DocumentSearchResponse>(
    `/api/v1/documents/${documentId}/search?q=${encodeURIComponent(query)}`,
    getSessionToken,
  );
}

// ---------------------------------------------------------------------------
// Phase 9: AI Teacher & Interactive Chat Tutor Types & API Methods
// ---------------------------------------------------------------------------

export type TeachingMode = "explain" | "simplify" | "socratic";
export type ExplanationDepth = "quick" | "standard" | "detailed";
export type PreferredLanguage = "auto" | "en" | "hi" | "hinglish";

export interface TeacherConversationResponse {
  id: string;
  document_id: string;
  clerk_user_id: string;
  title: string;
  teaching_mode: TeachingMode;
  explanation_depth: ExplanationDepth;
  preferred_language: PreferredLanguage;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface TeacherMessageResponse {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  source_pages: number[] | null;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  status: "completed" | "processing" | "failed";
  error_message: string | null;
  client_message_id: string | null;
  created_at: string;
}

export interface TeacherConversationDetailResponse extends TeacherConversationResponse {
  messages: TeacherMessageResponse[];
}

export interface TeacherConversationListResponse {
  items: TeacherConversationResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateTeacherConversationRequest {
  title?: string;
  teaching_mode?: TeachingMode;
  explanation_depth?: ExplanationDepth;
  preferred_language?: PreferredLanguage;
}

export interface UpdateTeacherConversationRequest {
  title?: string;
  teaching_mode?: TeachingMode;
  explanation_depth?: ExplanationDepth;
  preferred_language?: PreferredLanguage;
}

export interface SendTeacherMessageRequest {
  content: string;
  client_message_id?: string;
  is_voice_mode?: boolean;
}

export interface TeacherSpeechRequest {
  voice?: string;
  rate?: string;
}

export interface VoiceInfo {
  name: string;
  gender: string;
  language: string;
  locale: string;
  description: string;
}

export interface TeacherVoicesResponse {
  default_voice: string;
  voices: Record<string, VoiceInfo>;
}

/**
 * POST /api/v1/documents/{documentId}/conversations — creates a new teacher conversation.
 */
export function createTeacherConversation(
  documentId: string,
  data: CreateTeacherConversationRequest,
  getSessionToken: GetSessionToken,
): Promise<TeacherConversationResponse> {
  return authenticatedRequest<TeacherConversationResponse>(
    `/api/v1/documents/${documentId}/conversations`,
    getSessionToken,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * GET /api/v1/documents/{documentId}/conversations — lists conversations for a document.
 */
export function listTeacherConversations(
  documentId: string,
  getSessionToken: GetSessionToken,
  limit = 50,
  offset = 0,
): Promise<TeacherConversationListResponse> {
  return authenticatedRequest<TeacherConversationListResponse>(
    `/api/v1/documents/${documentId}/conversations?limit=${limit}&offset=${offset}`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId}/conversations/{conversationId} — gets conversation detail and messages.
 */
export function getTeacherConversation(
  documentId: string,
  conversationId: string,
  getSessionToken: GetSessionToken,
): Promise<TeacherConversationDetailResponse> {
  return authenticatedRequest<TeacherConversationDetailResponse>(
    `/api/v1/documents/${documentId}/conversations/${conversationId}`,
    getSessionToken,
  );
}

/**
 * PATCH /api/v1/documents/{documentId}/conversations/{conversationId} — updates conversation settings or title.
 */
export function updateTeacherConversation(
  documentId: string,
  conversationId: string,
  data: UpdateTeacherConversationRequest,
  getSessionToken: GetSessionToken,
): Promise<TeacherConversationResponse> {
  return authenticatedRequest<TeacherConversationResponse>(
    `/api/v1/documents/${documentId}/conversations/${conversationId}`,
    getSessionToken,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
}

/**
 * DELETE /api/v1/documents/{documentId}/conversations/{conversationId} — deletes a conversation.
 */
export function deleteTeacherConversation(
  documentId: string,
  conversationId: string,
  getSessionToken: GetSessionToken,
): Promise<void> {
  return authenticatedRequest<void>(
    `/api/v1/documents/${documentId}/conversations/${conversationId}`,
    getSessionToken,
    {
      method: "DELETE",
    },
  );
}

/**
 * POST /api/v1/documents/{documentId}/conversations/{conversationId}/messages — sends a message (sync).
 */
export function sendTeacherMessage(
  documentId: string,
  conversationId: string,
  data: SendTeacherMessageRequest,
  getSessionToken: GetSessionToken,
): Promise<TeacherMessageResponse> {
  return authenticatedRequest<TeacherMessageResponse>(
    `/api/v1/documents/${documentId}/conversations/${conversationId}/messages`,
    getSessionToken,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * POST /api/v1/documents/{documentId}/conversations/{conversationId}/messages/stream — streams response using SSE.
 */
export async function streamTeacherMessage(
  documentId: string,
  conversationId: string,
  data: SendTeacherMessageRequest,
  getSessionToken: GetSessionToken,
  callbacks: {
    onStarted?: (eventData: { user_message_id: string; assistant_message_id: string }) => void;
    onDelta?: (delta: string) => void;
    onCompleted?: (message: TeacherMessageResponse) => void;
    onError?: (error: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to make this request.");
  }

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/v1/documents/${documentId}/conversations/${conversationId}/messages/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
        signal,
      },
    );
  } catch (err: unknown) {
    if (signal?.aborted) return;
    throw new BackendUnavailableError(
      err instanceof Error ? err.message : "Backend is unreachable.",
    );
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let errMsg = `Streaming request failed with status ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errMsg = errJson.detail;
    } catch {}
    throw new ApiError(errMsg, response.status);
  }

  if (!response.body) {
    throw new ApiError("No response stream body available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        if (!evt.trim()) continue;
        const lines = evt.split("\n");
        let eventType = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6).trim();
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "message_started") {
              callbacks.onStarted?.(parsed);
            } else if (eventType === "text_delta") {
              callbacks.onDelta?.(parsed.delta || "");
            } else if (eventType === "message_completed") {
              callbacks.onCompleted?.({
                id: parsed.assistant_message_id,
                conversation_id: parsed.conversation_id,
                role: "assistant",
                content: parsed.content,
                source_pages: parsed.source_pages ?? [],
                model_name: parsed.model_name ?? null,
                input_tokens: parsed.input_tokens ?? null,
                output_tokens: parsed.output_tokens ?? null,
                status: "completed",
                error_message: null,
                client_message_id: null,
                created_at: parsed.created_at || new Date().toISOString(),
              });
            } else if (eventType === "message_failed") {
              callbacks.onError?.(parsed.error || "Message generation failed.");
            }
          } catch {
            // ignore JSON parse errors in malformed chunks
          }
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) return;
    throw err;
  }
}

/**
 * POST /api/v1/documents/{documentId}/conversations/{conversationId}/messages/{messageId}/retry — retries failed message.
 */
export function retryTeacherMessage(
  documentId: string,
  conversationId: string,
  messageId: string,
  getSessionToken: GetSessionToken,
): Promise<TeacherMessageResponse> {
  return authenticatedRequest<TeacherMessageResponse>(
    `/api/v1/documents/${documentId}/conversations/${conversationId}/messages/${messageId}/retry`,
    getSessionToken,
    {
      method: "POST",
    },
  );
}

/**
 * POST /api/v1/documents/{documentId}/conversations/{conversationId}/messages/{messageId}/speech — synthesizes speech MP3 blob.
 */
export async function fetchTeacherSpeechBlob(
  documentId: string,
  conversationId: string,
  messageId: string,
  options: TeacherSpeechRequest,
  getSessionToken: GetSessionToken,
  signal?: AbortSignal,
): Promise<Blob> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to make this request.");
  }

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/v1/documents/${documentId}/conversations/${conversationId}/messages/${messageId}/speech`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(options),
        signal,
      },
    );
  } catch (err: unknown) {
    if (signal?.aborted) throw err;
    throw new BackendUnavailableError(
      err instanceof Error ? err.message : "Backend is unreachable.",
    );
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let errMsg = `Speech synthesis failed with status ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errMsg = errJson.detail;
    } catch {}
    throw new ApiError(errMsg, response.status);
  }

  return response.blob();
}

/**
 * POST /api/v1/documents/{documentId}/conversations/{conversationId}/speech — synthesizes speech for a real-time streaming sentence chunk.
 */
export async function fetchStreamingSpeechBlob(
  documentId: string,
  conversationId: string,
  text: string,
  options: TeacherSpeechRequest,
  getSessionToken: GetSessionToken,
  signal?: AbortSignal,
): Promise<Blob> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to make this request.");
  }

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/v1/documents/${documentId}/conversations/${conversationId}/speech`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          voice: options.voice,
          rate: options.rate,
        }),
        signal,
      },
    );
  } catch (err: unknown) {
    if (signal?.aborted) throw err;
    throw new BackendUnavailableError(
      err instanceof Error ? err.message : "Backend is unreachable.",
    );
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let errMsg = `Streaming speech synthesis failed with status ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errMsg = errJson.detail;
    } catch {}
    throw new ApiError(errMsg, response.status);
  }

  return response.blob();
}

/**
 * GET /api/v1/documents/{documentId}/conversations/voices — gets available voices.
 */
export function listTeacherVoices(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<TeacherVoicesResponse> {
  return authenticatedRequest<TeacherVoicesResponse>(
    `/api/v1/documents/${documentId}/conversations/voices`,
    getSessionToken,
    {
      method: "GET",
    },
  );
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
} as const;
