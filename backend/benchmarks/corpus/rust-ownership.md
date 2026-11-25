# Rust Ownership

In Rust every value has a single owner and borrowing rules let the compiler prove that references never outlive their data. This removes whole classes of bugs such as use after free and data races without needing a garbage collector at runtime.
