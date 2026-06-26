import Foundation
import UIKit

enum FieldPhotoUploadResult {
    case success
    case networkError
    case permanentError(String)
}

enum FieldPhotoUploadClient {
    private static let maxBytes = 2_500_000

    private static var backendBaseUrl: String {
        TocOperatorNotifyClient.resolvedBackendBaseUrl
    }

    static func upload(
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpegData: Data,
        completion: @escaping (FieldPhotoUploadResult) -> Void
    ) {
        if jpegData.isEmpty {
            completion(.permanentError("Foto vuota."))
            return
        }
        if jpegData.count > maxBytes {
            completion(.permanentError("Foto troppo grande (max 2,5 MB)."))
            return
        }

        let base = backendBaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(base)/api/squad-field-photo") else {
            completion(.permanentError("TOC_BACKEND_URL non valido."))
            return
        }

        let boundary = "----GestSquadre\(Int(Date().timeIntervalSince1970 * 1000))"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )

        var body = Data()
        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append(
                "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"
                    .data(using: .utf8)!
            )
            body.append(value.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }

        appendField("sessionId", sessionId)
        appendField("latitude", String(latitude))
        appendField("longitude", String(longitude))
        if let accuracyM, accuracyM > 0 {
            appendField("accuracyM", String(accuracyM))
        }
        if let note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            appendField("note", String(note.prefix(200)))
        }

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"photo\"; filename=\"photo.jpg\"\r\n"
                .data(using: .utf8)!
        )
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpegData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                let nsError = error as NSError
                if nsError.domain == NSURLErrorDomain {
                    completion(.networkError)
                } else {
                    completion(.permanentError(error.localizedDescription))
                }
                return
            }

            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200...299).contains(status) {
                completion(.success)
                return
            }
            if status == 408 || status == 429 || status >= 502 {
                completion(.networkError)
                return
            }

            let message: String
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let err = json["error"] as? String,
               !err.isEmpty {
                message = err
            } else {
                message = "Invio foto fallito (\(status))."
            }
            completion(.permanentError(message))
        }.resume()
    }
}

enum FieldPhotoCompressor {
    private static let maxDimension: CGFloat = 1600
    private static let jpegQuality: CGFloat = 0.82
    private static let maxBytes = 2_500_000

    static func compressJpeg(_ input: Data) -> Data {
        guard let image = UIImage(data: input) else { return input }
        let oriented = image.normalizedOrientation()
        let scaled = scaleDown(oriented, maxDimension: maxDimension)
        var quality = jpegQuality
        var output = scaled.jpegData(compressionQuality: quality) ?? input
        while output.count > maxBytes, quality > 0.45 {
            quality -= 0.08
            output = scaled.jpegData(compressionQuality: quality) ?? output
        }
        return output
    }

    private static func scaleDown(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        let largest = max(size.width, size.height)
        guard largest > maxDimension else { return image }
        let scale = maxDimension / largest
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}

private extension UIImage {
    func normalizedOrientation() -> UIImage {
        if imageOrientation == .up { return self }
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

struct PendingFieldPhoto: Codable {
    let id: String
    let sessionId: String
    let latitude: Double
    let longitude: Double
    let accuracyM: Double?
    let note: String?
    let fileName: String
}

final class FieldPhotoUploadQueue {
    static let shared = FieldPhotoUploadQueue()

    private let folderName = "field_photo_queue"
    private let indexFileName = "queue.json"

    private var queueDirectory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent(folderName, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private var indexURL: URL {
        queueDirectory.appendingPathComponent(indexFileName)
    }

    func pendingCount() -> Int {
        listPending().count
    }

    func listPending() -> [PendingFieldPhoto] {
        guard let data = try? Data(contentsOf: indexURL),
              let items = try? JSONDecoder().decode([PendingFieldPhoto].self, from: data) else {
            return []
        }
        return items.filter { FileManager.default.fileExists(atPath: fileURL(for: $0).path) }
    }

    func enqueue(
        sessionId: String,
        latitude: Double,
        longitude: Double,
        accuracyM: Double?,
        note: String?,
        jpegData: Data
    ) -> PendingFieldPhoto {
        let id = UUID().uuidString
        let fileName = "\(id).jpg"
        let trimmedNote = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = PendingFieldPhoto(
            id: id,
            sessionId: sessionId,
            latitude: latitude,
            longitude: longitude,
            accuracyM: accuracyM,
            note: trimmedNote.flatMap { $0.isEmpty ? nil : String($0.prefix(200)) },
            fileName: fileName
        )
        try? jpegData.write(to: fileURL(for: item))
        var items = listPending().filter { $0.id != id }
        items.append(item)
        persist(items)
        return item
    }

    func readJpeg(item: PendingFieldPhoto) -> Data? {
        try? Data(contentsOf: fileURL(for: item))
    }

    func remove(item: PendingFieldPhoto) {
        try? FileManager.default.removeItem(at: fileURL(for: item))
        let items = listPending().filter { $0.id != item.id }
        persist(items)
    }

    private func fileURL(for item: PendingFieldPhoto) -> URL {
        queueDirectory.appendingPathComponent(item.fileName)
    }

    private func persist(_ items: [PendingFieldPhoto]) {
        if items.isEmpty {
            try? FileManager.default.removeItem(at: indexURL)
            return
        }
        if let data = try? JSONEncoder().encode(items) {
            try? data.write(to: indexURL)
        }
    }
}

import SwiftUI

struct FieldPhotoCameraPicker: UIViewControllerRepresentable {
    @Environment(\.dismiss) private var dismiss
    let onImage: (Data) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onImage: onImage, dismiss: dismiss)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (Data) -> Void
        let dismiss: DismissAction

        init(onImage: @escaping (Data) -> Void, dismiss: DismissAction) {
            self.onImage = onImage
            self.dismiss = dismiss
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            dismiss()
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            defer { dismiss() }
            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.95) else {
                return
            }
            onImage(data)
        }
    }
}

struct FieldPhotoNoteSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    let onSend: (String?) -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(
                    "GPS obbligatorio. Nota opzionale (max 200 caratteri). " +
                        "Nel log TOC: solo download JPEG."
                )
                .font(.system(size: 14))
                .foregroundStyle(.white)

                TextField("Nota (opzionale)", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: note) { _, newValue in
                        if newValue.count > 200 {
                            note = String(newValue.prefix(200))
                        }
                    }

                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color(red: 0.10, green: 0.18, blue: 0.10))
            .navigationTitle("Invia foto al TOC")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("INVIA FOTO") {
                        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSend(trimmed.isEmpty ? nil : trimmed)
                        dismiss()
                    }
                    .fontWeight(.black)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

enum FieldPhotoCopy {
    static let hint =
        "Invia una foto al TOC (log eventi). GPS obbligatorio. Nota opzionale (max 200 caratteri)."
    static let sentOk = "Foto inviata al TOC."
}
