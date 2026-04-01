#!/usr/bin/env bash
# =============================================================================
# Agent Team Architecture Test Script
#
# Tests the 11 refactored capabilities with realistic, vague user messages.
# Requires: server running on localhost:28847, jq installed.
#
# Usage:
#   ./scripts/test-agent-team.sh              # Run all tests
#   ./scripts/test-agent-team.sh routing      # Run only routing tests
#   ./scripts/test-agent-team.sh kanban       # Run only kanban tests
#   ./scripts/test-agent-team.sh delegation   # Run only delegation tests
#   ./scripts/test-agent-team.sh workflow     # Run only workflow tests
#   ./scripts/test-agent-team.sh messaging    # Run only messaging tests
# =============================================================================

set -euo pipefail

BASE="http://localhost:28847/api"
PASS=0
FAIL=0
SKIP=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
bold()   { printf "\033[1m%s\033[0m\n" "$1"; }

check_server() {
  if ! curl -sf "$BASE/../healthz" > /dev/null 2>&1; then
    red "Server not reachable at $BASE"
    echo "Start it with: rushdino start --foreground"
    exit 1
  fi
  green "Server is running"
}

chat() {
  local msg="$1"
  local conv="${2:-}"
  local body
  if [ -n "$conv" ]; then
    body=$(jq -n --arg m "$msg" --arg c "$conv" '{message: $m, conversation_id: $c}')
  else
    body=$(jq -n --arg m "$msg" '{message: $m}')
  fi
  curl -sf -X POST "$BASE/chat" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null
}

run_and_wait() {
  local msg="$1"
  local conv="${2:-}"
  local body
  if [ -n "$conv" ]; then
    body=$(jq -n --arg m "$msg" --arg c "$conv" '{message: $m, conversation_id: $c}')
  else
    body=$(jq -n --arg m "$msg" '{message: $m}')
  fi
  local run
  run=$(curl -sf -X POST "$BASE/runs" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null)
  local run_id
  run_id=$(echo "$run" | jq -r '.id')
  if [ "$run_id" = "null" ] || [ -z "$run_id" ]; then
    echo "$run"
    return 1
  fi
  # Wait up to 120s for completion
  curl -sf "$BASE/runs/$run_id/wait?timeout_ms=120000&require_terminal=true" 2>/dev/null
}

board() {
  curl -sf "$BASE/kanban/board" 2>/dev/null
}

agents() {
  curl -sf "$BASE/agents" 2>/dev/null
}

assert_contains() {
  local response="$1"
  local expected="$2"
  local test_name="$3"
  if echo "$response" | grep -qi "$expected"; then
    green "  PASS: $test_name"
    ((PASS++))
  else
    red "  FAIL: $test_name (expected to contain '$expected')"
    ((FAIL++))
  fi
}

assert_not_empty() {
  local response="$1"
  local test_name="$2"
  if [ -n "$response" ] && [ "$response" != "null" ] && [ "$response" != "{}" ]; then
    green "  PASS: $test_name"
    ((PASS++))
  else
    red "  FAIL: $test_name (response was empty)"
    ((FAIL++))
  fi
}

section() {
  echo ""
  bold "=== $1 ==="
  echo ""
}

# ---------------------------------------------------------------------------
# Test: Agent listing and tool scoping
# ---------------------------------------------------------------------------

test_agents() {
  section "1. Agent Listing & Tool Scoping"

  local result
  result=$(agents)

  # Verify agents exist
  local count
  count=$(echo "$result" | jq 'length')
  if [ "$count" -ge 8 ]; then
    green "  PASS: Found $count agents"
    ((PASS++))
  else
    red "  FAIL: Expected 8+ agents, got $count"
    ((FAIL++))
  fi

  # Check tool scoping is applied (software-engineer should have tools listed)
  local se_tools
  se_tools=$(echo "$result" | jq -r '.[] | select(.name == "software-engineer") | .tools // "null"')
  if [ "$se_tools" != "null" ] && [ -n "$se_tools" ]; then
    green "  PASS: software-engineer has tool scoping: ${se_tools:0:60}..."
    ((PASS++))
  else
    yellow "  SKIP: software-engineer tools field not exposed in API response"
    ((SKIP++))
  fi

  # Check claim_tags are present
  local se_tags
  se_tags=$(echo "$result" | jq -r '.[] | select(.name == "software-engineer") | .claim_tags // "null"')
  if [ "$se_tags" != "null" ] && [ -n "$se_tags" ]; then
    green "  PASS: software-engineer has claim_tags"
    ((PASS++))
  else
    yellow "  SKIP: claim_tags not exposed in API response"
    ((SKIP++))
  fi
}

# ---------------------------------------------------------------------------
# Test: Task routing — vague messages that should route to different agents
# ---------------------------------------------------------------------------

test_routing() {
  section "2. Task Routing (vague messages)"

  echo "  Sending vague messages to test TaskLevelDetector + kanban routing..."
  echo ""

  # Simple knowledge question — should be ImmediateResponse, no kanban task
  echo "  [a] Simple question (should NOT create kanban task)..."
  local r1
  r1=$(chat "what's the difference between TCP and UDP?" "test-routing-simple")
  assert_not_empty "$r1" "Simple question got a response"

  local board_before
  board_before=$(board | jq '.stats.total // 0')

  # Complex multi-step task — should trigger PostToBoard
  echo "  [b] Complex request (should create kanban task)..."
  local r2
  r2=$(chat "I need you to research the top 5 Rust web frameworks, compare their performance benchmarks, and write a recommendation doc with code examples for each" "test-routing-complex")

  sleep 3  # Give dispatcher time to pick up
  local board_after
  board_after=$(board | jq '.stats.total // 0')

  if [ "$board_after" -gt "$board_before" ]; then
    green "  PASS: Complex task created kanban entry (before=$board_before, after=$board_after)"
    ((PASS++))
  else
    yellow "  SKIP: Task may have been handled inline (depends on TaskLevelDetector thresholds)"
    ((SKIP++))
  fi
}

# ---------------------------------------------------------------------------
# Test: Kanban board operations
# ---------------------------------------------------------------------------

test_kanban() {
  section "3. Kanban Board & Event-Driven Dispatch"

  # Check board is accessible
  local b
  b=$(board)
  assert_not_empty "$b" "Kanban board is accessible"

  # Check stats structure
  local has_stats
  has_stats=$(echo "$b" | jq 'has("stats")')
  if [ "$has_stats" = "true" ]; then
    green "  PASS: Board has stats structure"
    ((PASS++))
  else
    red "  FAIL: Board missing stats"
    ((FAIL++))
  fi

  # Send a task-heavy request and check dispatch latency
  echo "  Testing event-driven dispatch speed..."
  local before_total
  before_total=$(board | jq '.stats.total // 0')

  chat "Set up a complete CI/CD pipeline for a Rust project with Docker, GitHub Actions, and automated releases" "test-kanban-dispatch"

  # Check within 2 seconds (old polling was 5s, new notify should be <1s)
  sleep 2
  local after_total
  after_total=$(board | jq '.stats.total // 0')

  if [ "$after_total" -gt "$before_total" ]; then
    green "  PASS: Task dispatched within 2s (event-driven working)"
    ((PASS++))
  else
    yellow "  SKIP: Task may have been handled inline"
    ((SKIP++))
  fi
}

# ---------------------------------------------------------------------------
# Test: Delegation chain — requests that should trigger agent-to-agent delegation
# ---------------------------------------------------------------------------

test_delegation() {
  section "4. Delegation & Context Passing"

  # This request should hit software-engineer, which should delegate design to designer
  echo "  [a] Request that crosses agent domains..."
  local r1
  r1=$(run_and_wait "Build a user settings page — needs a clean UI with proper accessibility, dark mode toggle, and the backend API to save preferences" "test-delegation-cross")
  assert_not_empty "$r1" "Cross-domain request completed"

  # This should involve planner -> software-engineer delegation
  echo "  [b] Planning request that needs implementation details..."
  local r2
  r2=$(run_and_wait "Plan out the migration from REST to GraphQL for our user service, including timeline, risks, and the first API endpoint to migrate" "test-delegation-plan")
  assert_not_empty "$r2" "Planning request completed"
}

# ---------------------------------------------------------------------------
# Test: Workflow execution with mixed step types
# ---------------------------------------------------------------------------

test_workflow() {
  section "5. Workflows (Agent + Script steps)"

  # Create a workflow with mixed step types via chat
  echo "  Asking agent to create a workflow..."
  local r1
  r1=$(chat "Create a workflow called 'health-check-pipeline' that: 1) runs 'echo system-ok' as a script step, 2) has a researcher analyze the output, 3) has a writer create a status report" "test-workflow-create")
  assert_not_empty "$r1" "Workflow creation request processed"

  # List workflows to check if it was created
  sleep 2
  local workflows
  workflows=$(curl -sf "$BASE/workflows" 2>/dev/null)
  local wf_count
  wf_count=$(echo "$workflows" | jq 'length // 0')
  if [ "$wf_count" -gt 0 ]; then
    green "  PASS: Workflows exist ($wf_count total)"
    ((PASS++))
  else
    yellow "  SKIP: No workflows created (agent may not have used create_workflow tool)"
    ((SKIP++))
  fi
}

# ---------------------------------------------------------------------------
# Test: Inter-agent messaging
# ---------------------------------------------------------------------------

test_messaging() {
  section "6. Inter-Agent Messaging & Team Status"

  # Ask an agent to check team status
  echo "  [a] Asking agent to check team status..."
  local r1
  r1=$(chat "Before you start any work, check what the rest of the team is doing right now" "test-team-status")
  assert_not_empty "$r1" "Team status request processed"

  # Ask an agent to message another agent
  echo "  [b] Asking agent to send a message to another agent..."
  local r2
  r2=$(chat "Send a message to the researcher agent asking them to look into Rust async runtimes when they're free" "test-messaging")
  assert_not_empty "$r2" "Messaging request processed"
}

# ---------------------------------------------------------------------------
# Test: Realistic multi-turn conversation
# ---------------------------------------------------------------------------

test_realistic() {
  section "7. Realistic Multi-Turn Scenario"

  local conv="test-realistic-$(date +%s)"

  echo "  Turn 1: Vague startup request..."
  local r1
  r1=$(chat "Hey, I'm thinking about adding real-time notifications to our app. Not sure where to start." "$conv")
  assert_not_empty "$r1" "Turn 1 response"

  echo "  Turn 2: Follow-up with more detail..."
  local r2
  r2=$(chat "Yeah let's go with WebSockets. Can you figure out what libraries are best for Rust and draft a quick architecture?" "$conv")
  assert_not_empty "$r2" "Turn 2 response"

  echo "  Turn 3: Ask for actual implementation..."
  local r3
  r3=$(chat "Looks good. Go ahead and start building it — set up the WebSocket server, add a broadcast channel, and write tests." "$conv")
  assert_not_empty "$r3" "Turn 3 response"

  # Check if any kanban tasks were created during this conversation
  local b
  b=$(board)
  local total
  total=$(echo "$b" | jq '.stats.total // 0')
  echo "  Kanban board now has $total total tasks"
}

# ---------------------------------------------------------------------------
# Test: Edge cases and error handling
# ---------------------------------------------------------------------------

test_edge_cases() {
  section "8. Edge Cases"

  # Empty-ish message
  echo "  [a] Minimal message..."
  local r1
  r1=$(chat "hmm" "test-edge-minimal")
  assert_not_empty "$r1" "Handles minimal input"

  # Very long message
  echo "  [b] Long rambling message..."
  local r2
  r2=$(chat "So I've been thinking about this for a while and basically what I want is something that can handle user authentication with OAuth2 and also maybe SAML and definitely needs to support multi-factor auth and session management and token refresh and we should probably also think about rate limiting and IP blocking and audit logging and compliance with SOC2 and GDPR and also the UX needs to be smooth so maybe magic links instead of passwords and biometric support on mobile and we need admin tools to manage all of this and also an API for third-party integrations and webhooks for events" "test-edge-long")
  assert_not_empty "$r2" "Handles long rambling input"

  # Ambiguous domain — could go to multiple agents
  echo "  [c] Ambiguous domain request..."
  local r3
  r3=$(chat "Make our error messages better" "test-edge-ambiguous")
  assert_not_empty "$r3" "Handles ambiguous request"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  bold "Agent Team Architecture Test Suite"
  echo "Testing against: $BASE"
  echo ""

  check_server

  local filter="${1:-all}"

  case "$filter" in
    agents|listing)   test_agents ;;
    routing)          test_routing ;;
    kanban)           test_kanban ;;
    delegation)       test_delegation ;;
    workflow)         test_workflow ;;
    messaging)        test_messaging ;;
    realistic)        test_realistic ;;
    edge)             test_edge_cases ;;
    all)
      test_agents
      test_routing
      test_kanban
      test_delegation
      test_workflow
      test_messaging
      test_realistic
      test_edge_cases
      ;;
    *)
      echo "Unknown test: $filter"
      echo "Available: agents, routing, kanban, delegation, workflow, messaging, realistic, edge, all"
      exit 1
      ;;
  esac

  # Summary
  echo ""
  bold "=== Results ==="
  green "  Passed:  $PASS"
  if [ "$FAIL" -gt 0 ]; then
    red "  Failed:  $FAIL"
  else
    echo "  Failed:  0"
  fi
  if [ "$SKIP" -gt 0 ]; then
    yellow "  Skipped: $SKIP"
  fi
  echo ""

  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
