cask "lede" do
  version "0.1.5"
  sha256 "508f7935e58af199946a5dad06c777550394d8027060e3fed84135ea62600c76"

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
