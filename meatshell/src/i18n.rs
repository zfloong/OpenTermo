//! Runtime internationalisation for dynamic Rust text.
//!
//! [`t`] returns the Chinese or English variant based on the current language
//! flag. The source language (the `zh` parameter) is Chinese; set `"en"` to
//! switch to the English (`en`) variant.

use std::sync::atomic::{AtomicU8, Ordering};

const ZH: u8 = 0;
const EN: u8 = 1;

static LANG: AtomicU8 = AtomicU8::new(ZH);

pub fn is_en() -> bool {
    LANG.load(Ordering::Relaxed) == EN
}

/// Pick the variant for the current language: `zh` is Chinese, `en` is English.
pub fn t(zh: &'static str, en: &'static str) -> &'static str {
    if is_en() {
        en
    } else {
        zh
    }
}
