cask "mdread" do
  version "0.1.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/OWNER/mdread/releases/download/v#{version}/mdread_#{version}_aarch64.dmg"
  name "mdread"
  desc "Minimal markdown reader/editor"
  homepage "https://github.com/OWNER/mdread"

  app "mdread.app"

  caveats <<~EOS
    mdread is unsigned. On first launch, right-click the app and choose Open,
    or run: xattr -dr com.apple.quarantine "#{appdir}/mdread.app"
  EOS
end
