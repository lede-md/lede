cask "lede" do
  version "0.1.3"
  sha256 "52e4089d639c54e57ebb9cc927a49c7c6b7a31b432c2cd7c99841f6cbf4826ba"

  url "https://github.com/lede-md/lede/releases/download/v#{version}/Lede_#{version}_aarch64.dmg"
  name "Lede"
  desc "Fast, native Markdown editor"
  homepage "https://github.com/lede-md/lede"

  app "Lede.app"

  caveats <<~EOS
    Lede is not notarized. On first launch, right-click Lede.app and choose Open,
    or run:
      xattr -dr com.apple.quarantine "#{appdir}/Lede.app"
  EOS
end
