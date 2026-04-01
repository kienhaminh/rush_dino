pub mod types;
pub mod pattern_registry;
pub mod trust_state;
pub mod trust_gate;
pub mod data_redactor;
pub mod policy_enforcer;
pub mod output_scanner;
pub mod prompt_shield;
pub mod pipeline;
pub(crate) mod glob;

#[cfg(test)]
mod pattern_registry_tests;
#[cfg(test)]
mod trust_state_tests;
#[cfg(test)]
mod trust_gate_tests;
#[cfg(test)]
mod data_redactor_tests;
#[cfg(test)]
mod policy_enforcer_tests;
#[cfg(test)]
mod output_scanner_tests;
#[cfg(test)]
mod prompt_shield_tests;
#[cfg(test)]
mod pipeline_tests;
#[cfg(test)]
mod integration_tests;
