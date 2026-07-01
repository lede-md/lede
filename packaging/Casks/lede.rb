cask "lede" do
  version "0.1.1"
  sha256 "ea117a50fb9d79b587456a23333946ed9fe6d78abac324cc33fb0db7af7de687"

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
