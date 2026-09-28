// ============================================================
// Citas NH — ENGLISH dictionary
// ------------------------------------------------------------
// RULE: every visible string in the app comes from here.
// Keep EXACTLY the same keys as es.js (same order helps).
// Loaded as window.I18N_EN; app.js picks the dictionary
// based on the saved language ("citasnh-lang").
// ============================================================
window.I18N_EN = {
  // ---- General ----
  appName: "Citas NH",
  nav_discover: "Discover",
  nav_matches: "Matches",
  nav_profile: "Profile",
  nav_settings: "Settings",
  common_cancel: "Cancel",
  common_confirm: "Confirm",
  common_ok: "OK",
  common_loading: "Loading…",
  common_back: "Back",
  common_save: "Save",
  common_send: "Send",
  common_delete: "Delete",

  // ---- Login ----
  login_title: "Log in",
  login_email: "Email",
  login_password: "Password",
  login_submit: "Log in",
  login_noAccount: "Don't have an account?",
  login_goRegister: "Sign up",

  // ---- Register ----
  register_title: "Create your account",
  register_email: "Email",
  register_password: "Password",
  register_name: "Display name",
  register_dob: "Date of birth",
  register_zip: "ZIP code",
  register_submit: "Create account",
  register_haveAccount: "Already have an account?",
  register_goLogin: "Log in",
  register_adultsOnly: "Adults 18+ only.",

  // ---- Backend errors (shown translated) ----
  err_INVALID_EMAIL: "That email doesn't look valid.",
  err_WEAK_PASSWORD: "The password is too weak.",
  err_INVALID_NAME: "The name is not valid.",
  err_INVALID_DOB: "The date of birth is not valid.",
  err_UNDERAGE: "You must be 18 or older to use Citas NH.",
  err_INVALID_ZIP: "The ZIP code is not valid.",
  err_EMAIL_TAKEN: "That email is already registered.",
  err_INVALID_CREDENTIALS: "Incorrect email or password.",
  err_BLOCKED: "You can't message this user.",
  err_TOO_MANY_PHOTOS: "You can only upload 3 photos.",
  err_GENERIC: "Something went wrong. Try again.",
  err_NETWORK: "No connection. Check your internet.",

  // ---- Discover ----
  discover_title: "Discover",
  discover_empty: "No more people for now. Come back later 💛",
  discover_like: "Like",
  discover_pass: "Pass",
  discover_interests: "Interests",

  // ---- Match ----
  match_title: "It's a match! 🎉",
  match_subtitle: "{name} likes you too.",
  match_chat: "Send a message",
  match_keep: "Keep discovering",

  // ---- Matches ----
  matches_title: "Your matches",
  matches_empty: "No matches yet. Keep discovering! 💘",

  // ---- Chat ----
  chat_placeholder: "Type a message…",
  chat_empty: "Be the first to say hi 👋",
  chat_report: "Report",
  chat_block: "Block",
  chat_reportConfirm: "Report this user?",
  chat_reportReason: "Reason for the report:",
  chat_reportReasonPh: "Describe what happened…",
  chat_reportSent: "Report sent. We'll review it.",
  chat_blockConfirm: "Block this user? They won't be able to message you anymore.",
  chat_blockDone: "User blocked.",

  // ---- Profile ----
  profile_title: "My profile",
  profile_bio: "About me",
  profile_bioPh: "Tell us who you are…",
  profile_gender: "Gender",
  profile_lookingFor: "Looking for",
  profile_languages: "Languages",
  profile_interests: "Interests",
  profile_interestsHint: "Separate them with commas",
  profile_town: "Town / City (NH)",
  profile_photos: "Photos (max 3)",
  profile_addPhoto: "Add photo",
  profile_saved: "Profile saved ✅",
  profile_deletePhotoConfirm: "Delete this photo?",
  profile_uploading: "Uploading photo…",
  gender_man: "Man",
  gender_woman: "Woman",
  gender_nonbinary: "Nonbinary",
  gender_unspecified: "Prefer not to say",
  looking_friendship: "Friendship",
  looking_dating: "Relationship",
  looking_casual: "Something casual",
  looking_unsure: "Not sure yet",
  lang_es: "Español",
  lang_en: "English",
  lang_pt: "Português",
  lang_fr: "Français",
  lang_other: "Other",

  // ---- Settings ----
  settings_title: "Settings",
  settings_language: "Language",
  settings_blocked: "Blocked users",
  settings_blockedEmpty: "You haven't blocked anyone.",
  settings_unblock: "Unblock",
  settings_unblockConfirm: "Unblock this user?",
  settings_terms: "Terms of use",
  settings_privacy: "Privacy policy",
  settings_logout: "Log out",
  settings_logoutConfirm: "Log out?",
  settings_delete: "Delete my account",
  settings_deleteTitle: "Delete account",
  settings_deleteWarning: "This deletes your account and all your data forever. It can't be undone.",
  settings_deletePrompt: "To confirm, type the word:",
  settings_deleteWord: "DELETE",
  settings_deleteWrong: "The word doesn't match. Try again.",
  settings_deleteConfirm: "Are you sure? This is your last chance.",
  settings_deleteDone: "Account deleted. We'll miss you!",
  settings_version: "Citas NH · v1.0",
};
