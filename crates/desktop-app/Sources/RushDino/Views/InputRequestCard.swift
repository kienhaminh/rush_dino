import SwiftUI

struct InputRequestCard: View {
  @Bindable var store: AppStore
  let request: PendingInputRequest

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label(request.payload.spec.title, systemImage: "questionmark.bubble")
        .font(.headline)
      if let description = request.payload.spec.description {
        Text(description)
          .foregroundStyle(.secondary)
      }

      ForEach(request.payload.spec.fields) { field in
        VStack(alignment: .leading, spacing: 5) {
          Text(field.label + (field.required == true ? " *" : ""))
            .font(.subheadline.weight(.medium))
          if let description = field.description {
            Text(description)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          control(for: field)
        }
      }

      HStack {
        Spacer()
        Button(request.payload.spec.cancelLabel ?? "Cancel") {
          Task { await store.resolveInputRequest(request, submitted: false) }
        }
        Button(request.payload.spec.submitLabel ?? "Submit") {
          Task { await store.resolveInputRequest(request, submitted: true) }
        }
        .buttonStyle(.borderedProminent)
        .disabled(!canSubmit)
      }
    }
    .padding(14)
    .background(Color.accentColor.opacity(0.06), in: .rect(cornerRadius: 14))
    .overlay {
      RoundedRectangle(cornerRadius: 14)
        .stroke(Color.accentColor.opacity(0.22))
    }
  }

  @ViewBuilder
  private func control(for field: InputFieldSpec) -> some View {
    switch field.fieldType {
    case .textarea:
      TextEditor(text: stringBinding(for: field))
        .frame(minHeight: 80)
        .scrollContentBackground(.hidden)
        .padding(6)
        .background(.quaternary, in: .rect(cornerRadius: 8))
    case .select:
      Picker(field.label, selection: stringBinding(for: field)) {
        ForEach(field.options ?? []) { option in
          Text(option.label).tag(option.value)
        }
      }
      .labelsHidden()
    case .multiselect:
      ForEach(field.options ?? []) { option in
        Toggle(option.label, isOn: selectionBinding(field: field, value: option.value))
      }
    case .boolean:
      Toggle(field.placeholder ?? field.label, isOn: boolBinding(for: field))
    case .number:
      TextField(field.placeholder ?? "", text: stringBinding(for: field))
    case .text:
      if field.secret == true {
        SecureField(field.placeholder ?? "", text: stringBinding(for: field))
      } else {
        TextField(field.placeholder ?? "", text: stringBinding(for: field))
      }
    }
  }

  private var canSubmit: Bool {
    request.payload.spec.fields.allSatisfy { field in
      let value = store.inputValue(requestID: request.id, field: field.name)
      if field.required != true, value?.isEmptyInput != false {
        return true
      }
      switch value {
      case .string(let value):
        if field.fieldType == .number { return false }
        let count = value.count
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          && field.minLength.map { count >= $0 } != false
          && field.maxLength.map { count <= $0 } != false
      case .array(let value):
        return !value.isEmpty
      case .number(let value):
        return field.min.map { value >= $0 } != false
          && field.max.map { value <= $0 } != false
      case .null, nil:
        return false
      default:
        return true
      }
    }
  }

  private func stringBinding(for field: InputFieldSpec) -> Binding<String> {
    Binding {
      store.inputValue(requestID: request.id, field: field.name)?.stringValue ?? ""
    } set: { value in
      if field.fieldType == .number, let number = Double(value) {
        store.setInputValue(.number(number), requestID: request.id, field: field.name)
      } else {
        store.setInputValue(.string(value), requestID: request.id, field: field.name)
      }
    }
  }

  private func boolBinding(for field: InputFieldSpec) -> Binding<Bool> {
    Binding {
      guard
        case .bool(let value) = store.inputValue(requestID: request.id, field: field.name)
      else { return false }
      return value
    } set: { value in
      store.setInputValue(.bool(value), requestID: request.id, field: field.name)
    }
  }

  private func selectionBinding(field: InputFieldSpec, value: String) -> Binding<Bool> {
    Binding {
      guard
        case .array(let values) = store.inputValue(requestID: request.id, field: field.name)
      else { return false }
      return values.contains(.string(value))
    } set: { selected in
      let current =
        store.inputValue(requestID: request.id, field: field.name)?.arrayValue ?? []
      let option = JSONValue.string(value)
      store.setInputValue(
        .array(selected ? Array(Set(current + [option])) : current.filter { $0 != option }),
        requestID: request.id,
        field: field.name
      )
    }
  }
}
