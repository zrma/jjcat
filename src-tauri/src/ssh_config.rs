use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use glob::glob;

use crate::domain::is_safe_host;

const MAX_INCLUDE_DEPTH: usize = 8;

pub fn explicit_host_aliases(config: &Path, home: &Path) -> io::Result<Vec<String>> {
    let mut aliases = BTreeSet::new();
    let mut visited = HashSet::new();
    collect_aliases(config, home, 0, &mut visited, &mut aliases)?;
    Ok(aliases.into_iter().collect())
}

fn collect_aliases(
    config: &Path,
    home: &Path,
    depth: usize,
    visited: &mut HashSet<PathBuf>,
    aliases: &mut BTreeSet<String>,
) -> io::Result<()> {
    if depth > MAX_INCLUDE_DEPTH {
        return Ok(());
    }
    let canonical = match config.canonicalize() {
        Ok(path) => path,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if !visited.insert(canonical.clone()) {
        return Ok(());
    }

    let source = fs::read_to_string(&canonical)?;
    for raw_line in source.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut fields = line.split_whitespace();
        let Some(keyword) = fields.next() else {
            continue;
        };
        if keyword.eq_ignore_ascii_case("host") {
            for alias in fields.take_while(|field| !field.starts_with('#')) {
                if !alias.bytes().any(|byte| b"*?!".contains(&byte)) && is_safe_host(alias) {
                    aliases.insert(alias.to_owned());
                }
            }
        } else if keyword.eq_ignore_ascii_case("include") {
            for pattern in fields.take_while(|field| !field.starts_with('#')) {
                let expanded = expand_include_pattern(pattern, canonical.parent(), home);
                let pattern = expanded.to_string_lossy();
                let entries = glob(&pattern).map_err(|error| {
                    io::Error::new(io::ErrorKind::InvalidInput, error.to_string())
                })?;
                for entry in entries.flatten() {
                    collect_aliases(&entry, home, depth + 1, visited, aliases)?;
                }
            }
        }
    }
    Ok(())
}

fn expand_include_pattern(pattern: &str, parent: Option<&Path>, home: &Path) -> PathBuf {
    if let Some(suffix) = pattern.strip_prefix("~/") {
        return home.join(suffix);
    }
    let path = PathBuf::from(pattern);
    if path.is_absolute() {
        path
    } else {
        parent.unwrap_or(home).join(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reads_explicit_aliases_and_included_configs() {
        let directory = tempdir().unwrap();
        let ssh = directory.path().join(".ssh");
        fs::create_dir_all(ssh.join("config.d")).unwrap();
        fs::write(
            ssh.join("config"),
            "Host fixture-b fixture-* !fixture-denied\nInclude config.d/*.conf\n",
        )
        .unwrap();
        fs::write(
            ssh.join("config.d/fixture.conf"),
            "Host fixture-a fixture_b\n  HostName example.invalid\n",
        )
        .unwrap();

        let aliases = explicit_host_aliases(&ssh.join("config"), directory.path()).unwrap();

        assert_eq!(aliases, vec!["fixture-a", "fixture-b", "fixture_b"]);
    }
}
