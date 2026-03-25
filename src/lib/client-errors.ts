import { resolveErrorMessage, type ErrorMessageMap } from "@/lib/client-response";

const AUTH_ERROR_MESSAGES = {
  USER_NOT_FOUND: "未找到该账号，请先注册。",
  INVALID_CREDENTIALS: "用户名或密码不正确。",
  FORBIDDEN_ROLE: "该账号没有对应入口权限。",
  PRIVACY_CONSENT_REQUIRED: "请先同意内容加密存储于服务器。",
  AI_CONSENT_REQUIRED: "请先同意内容上传模型进行分析。",
  RATE_LIMITED: "操作过于频繁，请稍后再试。"
} satisfies ErrorMessageMap;

const COMPLETE_SESSION_ERROR_MESSAGES = {
  SESSION_COMPLETING: "这段会谈正在收尾处理中，请稍等片刻后刷新查看状态。",
  NOT_FOUND: "这段会谈不存在，可能已经被删除。"
} satisfies ErrorMessageMap;

const RERUN_SUPERVISION_ERROR_MESSAGES = {
  SESSION_NOT_COMPLETED: "这段会谈尚未结束，暂时不能补做督导。",
  NOT_FOUND: "这段会谈不存在，可能已经被删除。"
} satisfies ErrorMessageMap;

const CREATE_SESSION_ERROR_MESSAGES = {
  ACTIVE_SESSION_EXISTS: "你还有一段进行中的对话。先继续或结束当前对话，再开始新的会谈吧。"
} satisfies ErrorMessageMap;

export const DELETE_SESSION_SUCCESS_MESSAGE = "会谈已删除，对应记录与派生督导内容已同步清理。";
export const SUPERVISION_SESSION_NOT_FOUND_MESSAGE = "未找到与该督导记录对应的存档会谈";
export const ACTIVE_SESSION_EXISTS_MESSAGE = CREATE_SESSION_ERROR_MESSAGES.ACTIVE_SESSION_EXISTS;

export function getAuthErrorMessage(error?: string) {
  return resolveErrorMessage(error, "暂时无法继续，请稍后再试。", AUTH_ERROR_MESSAGES);
}

export function getCompleteSessionErrorMessage(error?: string) {
  return resolveErrorMessage(error, "结束失败", COMPLETE_SESSION_ERROR_MESSAGES);
}

export function getCreateSessionErrorMessage(error?: string) {
  return resolveErrorMessage(error, "创建失败", CREATE_SESSION_ERROR_MESSAGES);
}

export function getRerunSupervisionErrorMessage(error?: string) {
  return resolveErrorMessage(error, "手动督导失败", RERUN_SUPERVISION_ERROR_MESSAGES);
}

export function getCompleteSessionSuccessMessage(payload?: {
  supervisionCreated?: boolean;
  supervisionFailed?: boolean;
  alreadyCompleted?: boolean;
}) {
  if (payload?.alreadyCompleted) {
    return "本次会谈已处于结束状态。";
  }

  if (payload?.supervisionCreated) {
    return "本次会谈已结束，并已自动生成督导记录。";
  }

  if (payload?.supervisionFailed) {
    return "本次会谈已结束，但自动督导暂未生成成功。";
  }

  return "本次会谈已结束。";
}

export function getRerunSupervisionSuccessMessage(payload?: {
  supervisionCreated?: boolean;
  alreadyCreated?: boolean;
}) {
  if (payload?.alreadyCreated) {
    return "这段会谈已有督导记录。";
  }

  if (payload?.supervisionCreated) {
    return "已为这段归档补做督导。";
  }

  return "已发起手动督导。";
}
