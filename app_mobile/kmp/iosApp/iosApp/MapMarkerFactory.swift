import UIKit
import shared

private let squadChipMaxChars = 28

enum MapMarkerFactory {
    static func squadMarker(
        squad: LiveSquadPin,
        alarming: Bool,
        isSelf: Bool,
        scale: CGFloat = UIScreen.main.scale
    ) -> UIImage {
        let density = scale / UIScreen.main.scale
        let iconHeight: CGFloat = {
            if isSelf { return 32 * density }
            if alarming { return 30 * density }
            return 28 * density
        }()
        let iconBitmap = loadIconBitmap(
            name: SquadIcons.bundleImageName(forKey: squad.mapIconKey),
            targetHeight: iconHeight
        )
        let label = squadMapChipLabel(squad: squad, alarming: alarming)
        let labelBg = alarming ? UIColor(red: 0.78, green: 0.16, blue: 0.16, alpha: 1) : UIColor(white: 0.07, alpha: 1)
        let labelBorder = alarming ? UIColor.white : UIColor(red: 0.29, green: 0.33, blue: 0.41, alpha: 1)

        let textFont = UIFont.boldSystemFont(ofSize: 10 * density)
        let textAttrs: [NSAttributedString.Key: Any] = [.font: textFont, .foregroundColor: UIColor.white]
        let textWidth = (label as NSString).size(withAttributes: textAttrs).width
        let width = max(max(iconBitmap.size.width, textWidth) + 18 * density, 168 * density)
        let labelHeight = 16 * density
        let height = iconBitmap.size.height + labelHeight + 4 * density

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        return renderer.image { _ in
            let cx = width / 2
            iconBitmap.draw(at: CGPoint(x: cx - iconBitmap.size.width / 2, y: 1 * density))

            let labelTop = iconBitmap.size.height + 3 * density
            let labelRect = CGRect(
                x: 8 * density,
                y: labelTop,
                width: width - 16 * density,
                height: height - labelTop - 2 * density
            )
            let corner = 6 * density
            let path = UIBezierPath(roundedRect: labelRect, cornerRadius: corner)
            labelBg.setFill()
            path.fill()
            labelBorder.setStroke()
            path.lineWidth = (alarming ? 2 : 1.5) * density
            path.stroke()

            drawCenteredLabel(label, in: labelRect, attributes: textAttrs)
        }
    }

    static func waypointMarker(waypoint: MapWaypointPin, scale: CGFloat = UIScreen.main.scale) -> UIImage {
        let density = scale / UIScreen.main.scale
        let iconHeight = 28 * density
        let iconBitmap = loadIconBitmap(name: WaypointIcons.imageName(for: waypoint.iconKey), targetHeight: iconHeight)
        let label = waypoint.displayName.uppercased()
        let textFont = UIFont.boldSystemFont(ofSize: 9 * density)
        let textAttrs: [NSAttributedString.Key: Any] = [.font: textFont, .foregroundColor: UIColor.black]
        let textWidth = (label as NSString).size(withAttributes: textAttrs).width
        let width = max(max(iconBitmap.size.width, textWidth) + 14 * density, 72 * density)
        let labelHeight = 14 * density
        let height = iconBitmap.size.height + labelHeight + 2 * density

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        return renderer.image { _ in
            let cx = width / 2
            iconBitmap.draw(at: CGPoint(x: cx - iconBitmap.size.width / 2, y: 0))

            let labelTop = iconBitmap.size.height + 1 * density
            let padH = 5 * density
            let labelRect = CGRect(
                x: max(4 * density, cx - textWidth / 2 - padH),
                y: labelTop,
                width: min(width - 8 * density, textWidth + padH * 2),
                height: height - labelTop - 1 * density
            )
            let path = UIBezierPath(roundedRect: labelRect, cornerRadius: 5 * density)
            UIColor(red: 1, green: 0.41, blue: 0.41, alpha: 1).setFill()
            path.fill()
            UIColor.white.setStroke()
            path.lineWidth = 1.2 * density
            path.stroke()
            drawCenteredLabel(label, in: labelRect, attributes: textAttrs)
        }
    }

    private static func drawCenteredLabel(
        _ text: String,
        in rect: CGRect,
        attributes: [NSAttributedString.Key: Any]
    ) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        var attrs = attributes
        attrs[.paragraphStyle] = paragraph
        let bounding = (text as NSString).boundingRect(
            with: CGSize(width: rect.width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs,
            context: nil
        )
        let drawRect = CGRect(
            x: rect.minX,
            y: rect.minY + max(0, (rect.height - bounding.height) / 2),
            width: rect.width,
            height: bounding.height
        )
        (text as NSString).draw(
            with: drawRect,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs,
            context: nil
        )
    }

    private static func squadMapChipLabel(squad: LiveSquadPin, alarming: Bool) -> String {
        let base = (squad.squadName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? squad.squadCode : squad.squadName)
            .prefix(squadChipMaxChars)
            .uppercased()
        return alarming ? "⚠ \(base)" : String(base)
    }

    private static func loadIconBitmap(name: String, targetHeight: CGFloat) -> UIImage {
        guard let image = UIImage(named: name), image.size.height > 0 else {
            return UIImage()
        }
        let scale = targetHeight / image.size.height
        let outW = max(image.size.width * scale, 1)
        let outH = max(targetHeight, 1)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: outW, height: outH))
        return renderer.image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: outW, height: outH))
        }
    }
}
