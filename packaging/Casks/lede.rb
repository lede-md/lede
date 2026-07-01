cask "lede" do
  version "0.1.4"
  sha256 "ae5f2dfad819479082053a7f2af36b2e4e1e2e1232d8afe7a9a54d46ee832bb4"

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
