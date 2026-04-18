use keyring::Entry;

const DEFAULT_SERVICE: &str = "ai.rushdino.desktop";

fn service_or_default(service: &str) -> &str {
    if service.is_empty() {
        DEFAULT_SERVICE
    } else {
        service
    }
}

pub fn set(service: &str, account: &str, password: &str) -> keyring::Result<()> {
    let entry = Entry::new(service_or_default(service), account)?;
    entry.set_password(password)
}

pub fn get(service: &str, account: &str) -> keyring::Result<Option<String>> {
    let entry = Entry::new(service_or_default(service), account)?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn delete(service: &str, account: &str) -> keyring::Result<()> {
    let entry = Entry::new(service_or_default(service), account)?;
    entry.delete_credential()
}
