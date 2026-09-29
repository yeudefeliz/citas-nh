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
  common_close: "Close",
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
  premium_title: "Citas NH Premium",
  premium_banner: "See who liked you 👑",
  premium_modalTitle: "You've hit today's limit",
  premium_modalText: "Free accounts get 10 likes per day. With Premium they're unlimited, plus you see who liked you.",
  premium_notNow: "Not now",
  premium_cta: "Go Premium",
  premium_ctaShort: "See plans",
  premium_f1: "See who liked you",
  premium_f2: "Unlimited likes",
  premium_f3: "Support an app made for NH",
  premium_price: "$4.99/mo · cancel anytime",
  premium_note: "Secure payment with Stripe. Renews monthly.",
  premium_success: "Payment successful! Welcome to Premium 👑",
  premium_cancelled: "Payment cancelled, no charges.",
  premium_soon: "Premium is coming very soon 💛",
  premium_active: "You have Premium active 👑",
  premium_activeShort: "Premium active",
  premium_until: "Renews on {date}",
  premium_manage: "Manage subscription",
  admirers_title: "They like you",
  admirers_locked: "liked your profile — go Premium to see who they are",
  err_LIKE_LIMIT_REACHED: "You've reached today's like limit 💛",
  err_PREMIUM_NOT_CONFIGURED: "Premium isn't available yet.",
  err_PAYMENT_ERROR: "There was a payment problem. Try again.",
  err_NO_SUBSCRIPTION: "You don't have an active subscription.",

  // ---- Visitors ----
  visitors_title: "Who viewed your profile",
  visitors_locked: "viewed your profile — go Premium to see who they are",
  visitors_empty: "Nobody has viewed your profile yet 👀",

  // ---- Discover filters ----
  filters_title: "Filters",
  filters_minAge: "Min age",
  filters_maxAge: "Max age",
  filters_maxDistance: "Max distance",
  filters_any: "Any",
  filters_miles: "{n} miles",
  filters_apply: "Apply",
  filters_clear: "Clear",
  discover_distance: "~{n} miles away",
  discover_boosted: "🚀 Boost",
  view_profile_hint: "Tap the photo to see the full profile",

  // ---- Super like ----
  superlike: "Super like",
  superlike_badge: "⭐ Super like",
  err_SUPERLIKE_LIMIT_REACHED: "You've used today's super like ⭐",
  err_INVALID_SIGNAL: "Invalid call signal.",
  err_SIGNAL_TOO_LARGE: "The signal is too large.",
  err_NO_MATCH: "You can only call your matches.",

  // ---- Boost ----
  boost_button: "Boost 🚀 $1.99",
  boost_desc: "Your profile shows first in Discover for 30 minutes.",
  boost_active: "Boost active until {time} 🚀",
  boost_success: "Boost activated! 🚀",
  boost_cancelled: "Boost cancelled, no charges.",

  // ---- Video call ----
  call_video: "Video call",
  call_calling: "Calling…",
  call_connecting: "Connecting…",
  call_incoming: "📹 {name} is calling you",
  call_accept: "Accept",
  call_reject: "Decline",
  call_hangup: "Hang up",
  call_ended: "Call ended",
  call_rejected: "Declined the call",
  call_noCamera: "Couldn't access the camera.",
  call_failed: "Couldn't start the call.",

  // ---- Invisible mode ----
  invisible_title: "Invisible mode",
  invisible_desc: "Nobody will see that you visited their profile. Your visits leave no trace.",
  invisible_toggle: "Turn on invisible mode 🥷",
  invisible_locked: "Invisible mode is Premium only.",
  invisible_on: "Invisible mode on 🥷",
  invisible_off: "Invisible mode off",

  // ---- Verification ----
  verify_title: "Profile verification",
  verify_desc: "Take a new selfie (NOT one of your profile photos) and get your ✅ badge instantly.",
  verify_cta: "Verify my profile",
  verify_done: "Your profile is verified ✅",
  verify_pickPhoto: "Pick your selfie first 📸",
  verify_uploading: "Uploading selfie…",

  // ---- Voice notes ----
  chat_voice: "Voice note",
  voice_recording: "Recording… tap ⏹ to send (max 1 min)",
  voice_sending: "Sending voice note…",
  voice_noMic: "Couldn't access the microphone.",

  // ---- Gifts ----
  gift_title: "Send a gift",
  gift_desc: "The gift shows up in the chat once payment completes.",
  gift_rosa: "Rose",
  gift_trago: "Drink",
  gift_diamante: "Diamond",
  gift_sent: "Gift sent! 🎁",
  gift_cancelled: "Payment cancelled, no charges.",
  gift_empty: "The gift shop isn't available.",

  // ---- Events ----
  nav_events: "Events",
  events_title: "NH events",
  events_new: "Create event",
  events_title_label: "Title",
  events_desc_label: "Description",
  events_place_label: "Venue",
  events_town_label: "Town",
  events_date_label: "Date & time",
  events_create: "Publish event",
  events_rsvp: "I'm in ✅",
  events_rsvp_on: "Going!",
  events_attendees: "going",
  events_empty: "No events yet. Create the first one! 🎉",
  events_created: "Event created! 🎉",

  // ---- New errors ----
  err_SELFIE_SAME_AS_PHOTO: "That photo is already on your profile. Take a new selfie 📸",
  err_INVALID_GIFT: "Invalid gift.",
  err_INVALID_TITLE: "The title isn't valid.",
  err_INVALID_DESCRIPTION: "The description isn't valid.",
  err_INVALID_PLACE: "The venue isn't valid.",
  err_INVALID_TOWN: "The town isn't valid.",
  err_INVALID_DATE: "The date isn't valid.",
  err_DATE_IN_PAST: "The date can't be in the past.",
  err_EVENT_NOT_FOUND: "Event not found.",
  err_NO_FILE: "No file received.",
  err_INVALID_VIDEO: "Only videos are allowed (max 30 MB).",
  err_VIDEO_NOT_FOUND: "You don't have an intro video.",
  err_FILE_TOO_LARGE: "The file is too large.",
  err_INVALID_PLAN: "The date details aren't valid (place and a future date).",
  err_PLAN_NOT_FOUND: "Date plan not found.",
  err_NOT_YOUR_PLAN: "You can't respond to your own proposal.",
  err_PLAN_RESPONDED: "This date was already answered.",
  err_INVALID_EMOJI: "That emoji isn't allowed.",
  err_MESSAGE_NOT_FOUND: "Message not found.",

  // ---- Stories ----
  stories_title: "Stories",
  story_add: "Your story",
  story_uploading: "Uploading story…",
  story_uploaded: "Story posted! 📸",
  story_delete: "Delete story",
  story_deleteConfirm: "Delete this story?",
  story_deleted: "Story deleted.",
  story_empty: "Nobody posted stories today. Be the first! 📸",
  story_tooBig: "The file is too big (max 15 MB).",

  // ---- Icebreakers ----
  icebreaker_btn: "Icebreaker",
  icebreaker_hint: "Don't know what to say? Try an icebreaker 🧊",
  icebreaker_fail: "Couldn't load the icebreaker.",

  // ---- Reactions ----
  react_title: "React",
  react_hint: "Long-press a message to react",

  // ---- Referrals ----
  referral_title: "Invite & win 🎁",
  referral_desc: "Share your code: every friend who joins gives you 5 extra super likes (max 20).",
  referral_code: "Your code",
  referral_share: "Share on WhatsApp",
  referral_copied: "Link copied! 📋",
  referral_joined: "{n} friends joined",
  referral_bonus: "You have {n} extra super likes ⭐",
  referral_shareText: "Join Citas NH, the New Hampshire dating app! Sign up with my code:",
  register_invited: "🎁 You arrived with a friend's code",

  // ---- Top Picks ----
  toppicks_title: "Top Picks 💎",
  toppicks_sub: "Elegidos para ti hoy",
  toppicks_empty: "No hay Top Picks hoy. ¡Sigue descubriendo! 💎",
  toppicks_premium: "💎 Premium",

  // ---- Profile video ----
  profile_video: "Intro video",
  profile_videoAdd: "Upload intro video",
  profile_videoReplace: "Change video",
  profile_videoDelete: "Delete video",
  profile_videoHint: "Max 30 MB. The video shows first on your card.",
  profile_videoUploading: "Uploading video…",
  profile_videoDone: "Video updated! 🎥",
  profile_videoDeleted: "Video deleted.",

  // ---- Chat translation ----
  translate_btn: "Translate message",
  translate_fail: "Couldn't translate. Check your connection and try again.",

  // ---- Presence ----
  presence_online: "Online",
  presence_now: "active just now",
  presence_min: "active {n} min ago",
  presence_hour: "{n} h ago",
  presence_yesterday: "yesterday",
  presence_days: "{n} days ago",

  // ---- Plan a date ----
  dateplan_btn: "Plan a date",
  dateplan_title: "Plan a date",
  dateplan_place: "Place",
  dateplan_place_ph: "E.g.: Central Café, Manchester",
  dateplan_when: "Date and time",
  dateplan_note: "Note (optional)",
  dateplan_note_ph: "E.g.: I'll wear a red shirt 😄",
  dateplan_send: "Propose date",
  dateplan_waiting: "Waiting for a reply…",
  dateplan_accept: "Accept",
  dateplan_decline: "Decline",
  dateplan_confirmed: "Date confirmed: {place} — {date}",
  dateplan_declined: "Date declined",
  dateplan_missing: "Date plan unavailable.",

  // ---- Achievements ----
  achievements_title: "Achievements",
  achievements_level: "Level {n}",
  achievements_progress: "{a} of {b} achievements",
  achievement_unlocked: "Achievement unlocked: {name}!",
  ach_level_1: "Newcomer",
  ach_level_2: "Known",
  ach_level_3: "Popular",
  ach_level_4: "Star",
  ach_level_5: "Legend",
  ach_first_like: "First crush",
  ach_first_match: "It's a match!",
  ach_chatterbox: "Chatterbox",
  ach_popular: "Popular",
  ach_verified: "Verified",
  ach_social: "Social life",
  ach_sharer: "Ambassador",

  // ---- Welcome bonus ----
  welcome_title: "Welcome to Citas NH! 🎁",
  welcome_text: "Here are {n} free Super Likes to get you started 💖",
  welcome_cta: "Let's go! 🔥",

  // ---- System message ----
  match_welcome: "🎉 It's a match! Say hi with an icebreaker 🧊",

  // ---- Push notifications ----
  push_title: "Notifications",
  push_on: "On",
  push_off: "Off",
  push_enabled: "Notifications enabled 🔔",
  push_disabled: "Notifications off",
  push_denied: "Permission denied. Enable them in your browser settings.",
  push_unsupported: "Your browser doesn't support notifications",
  push_notConfigured: "Notifications not configured yet",

  // ---- Map ----
  nav_map: "Map",
  map_title: "Singles nearby",
  map_desc: "See where Citas NH people are across New Hampshire 🗺️",
  map_popup: "👥 {n} near {town}",
  map_empty: "No active singles on the map yet. Invite your friends! 📣",
  map_fail: "Couldn't load the map. Check your connection.",

  // ---- PWA: install the app ----
  pwa_install_title: "Install Citas NH 📲",
  pwa_install_desc: "A home-screen shortcut, just like a regular app.",
  pwa_install_btn: "Install",
  pwa_install_later: "Not now",
  pwa_install_manual_ios: "On iPhone: tap Share, then 'Add to Home Screen'.",
  pwa_install_manual_android: "On Android: open the browser menu ⋮ and tap 'Install app'.",
  pwa_install_manual_desktop: "In your browser: open the menu and choose 'Install Citas NH'.",
};
