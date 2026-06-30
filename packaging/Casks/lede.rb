cask "lede" do
  version "0.1.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/lede-md/lede/releases/download/v#{version}/Lede_#{version}_aarch64.dmg"
  name "Lede"
  desc "Minimal markdown reader/editor"
  homepage "https://github.com/lede-md/lede"

  app "Lede.app"

  caveats <<~EOS
    Lede is unsigned. On first launch, right-click the app and choose Open,
    or run: xattr -dr com.apple.quarantine "#{appdir}/Lede.app"
  EOS
end
