// Hand-written subset of the Telegram Bot API's update payload.
//
// Only the fields this bot actually reads are declared. The full API surface is
// enormous and mostly irrelevant here, and a generated types package would be a
// new dependency for a project that deliberately has none for Telegram (the
// sibling projects hand-roll their fetch calls too).
//
// Everything is optional and narrow on purpose: this data arrives over the wire
// from outside the app, so the parser must treat a missing field as normal
// rather than as an error.

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type?: string;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date?: number;
  text?: string;
  document?: TelegramDocument;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

/** One button in an inline keyboard. `callback_data` is capped at 64 BYTES. */
export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

/** Rows of buttons, as `reply_markup.inline_keyboard` wants them. */
export type InlineKeyboard = InlineButton[][];

/**
 * Who sent an update, whichever kind it is.
 *
 * The owner check reads the USER id, never the chat id: the chat id of a
 * private conversation happens to equal the user's id, but that is a
 * coincidence of Telegram's numbering, and it stops being true the moment the
 * bot is added to a group.
 */
export function updateSender(update: TelegramUpdate): TelegramUser | null {
  return (
    update.callback_query?.from ??
    update.message?.from ??
    update.edited_message?.from ??
    null
  );
}

/** Which chat to reply into. */
export function updateChatId(update: TelegramUpdate): number | null {
  const chat =
    update.callback_query?.message?.chat ??
    update.message?.chat ??
    update.edited_message?.chat ??
    null;
  return chat ? chat.id : null;
}
