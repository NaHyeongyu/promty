import { useCallback } from "react";
import { useI18n } from "./I18nProvider";

export type AdminLocale = "en" | "ko";

const KOREAN_SERVER_COPY: Record<string, string> = {
  "AI activity": "AI 활동",
  "AI generation": "AI 생성",
  Memory: "메모리",
  Projects: "프로젝트",
  Support: "고객 문의",
  System: "시스템",
  "Generation jobs failed": "생성 작업 실패",
  "Review failed artifact generation jobs before users retry.": "사용자가 재시도하기 전에 실패한 산출물 생성 작업을 확인하세요.",
  "Generation jobs may be stuck": "생성 작업 지연 가능성",
  "Pending or running generation jobs have not updated recently.": "대기 중이거나 실행 중인 생성 작업이 최근 갱신되지 않았습니다.",
  "Responses may be missing": "응답 누락 가능성",
  "Prompt submissions exceed recorded responses. Check collector ingestion.": "제출된 프롬프트가 기록된 응답보다 많습니다. 수집기 입력 상태를 확인하세요.",
  "Pending memory needs attention": "대기 중인 메모리 확인 필요",
  "Generated summaries are waiting to be organized from pending memory.": "생성된 요약이 대기 메모리에서 정리되기를 기다리고 있습니다.",
  "Repositories are not connected": "저장소가 연결되지 않음",
  "Projects without repositories cannot show file context.": "저장소가 없는 프로젝트는 파일 컨텍스트를 표시할 수 없습니다.",
  "Projects have no activity yet": "활동이 없는 프로젝트 존재",
  "Projects with no captured events may need onboarding follow-up.": "수집된 이벤트가 없는 프로젝트는 온보딩 확인이 필요할 수 있습니다.",
  "Support notifications failed": "문의 알림 전송 실패",
  "Inquiry email delivery failed. Review the notification configuration and error.": "문의 이메일 전송에 실패했습니다. 알림 설정과 오류를 확인하세요.",
  "Support inquiries need review": "확인이 필요한 문의",
  "New or in-progress user inquiries are waiting for an administrator.": "신규 또는 처리 중인 사용자 문의가 관리자의 확인을 기다리고 있습니다.",
  "Session cookie is not marked secure": "세션 쿠키에 보안 속성이 없음",
  "PROMPTHUB_SESSION_COOKIE_SECURE is false.": "PROMPTHUB_SESSION_COOKIE_SECURE가 false입니다.",
  "Dedicated GitHub token key is not configured": "GitHub 토큰 전용 키가 설정되지 않음",
  "GitHub token encryption falls back to another application secret.": "GitHub 토큰 암호화가 다른 애플리케이션 비밀값을 대신 사용합니다.",
  "Dedicated app encryption key is not configured": "앱 전용 암호화 키가 설정되지 않음",
  "Prompt and response encryption falls back to another application secret.": "프롬프트와 응답 암호화가 다른 애플리케이션 비밀값을 대신 사용합니다.",
  "External memory generation is enabled": "외부 메모리 생성이 활성화됨",
  "Compact prompt and response evidence can be sent to an external memory generator.": "요약된 프롬프트와 응답 근거가 외부 메모리 생성기로 전송될 수 있습니다.",
};

export function selectAdminText(locale: AdminLocale, english: string, korean: string) {
  return locale === "ko" ? korean : english;
}

export function translateAdminServerText(locale: AdminLocale, value: string) {
  return locale === "ko" ? KOREAN_SERVER_COPY[value] ?? value : value;
}

export function useAdminLocale() {
  const { locale, setLocale } = useI18n();
  const adminLocale: AdminLocale = locale === "ko" ? "ko" : "en";
  const text = useCallback(
    (english: string, korean: string) => selectAdminText(adminLocale, english, korean),
    [adminLocale],
  );
  const serverText = useCallback(
    (value: string) => translateAdminServerText(adminLocale, value),
    [adminLocale],
  );

  return {
    locale: adminLocale,
    setLocale: (nextLocale: AdminLocale) => setLocale(nextLocale),
    serverText,
    text,
  };
}
