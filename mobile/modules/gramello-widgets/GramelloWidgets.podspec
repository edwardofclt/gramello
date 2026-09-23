require 'fileutils'

# CocoaPods source globs cannot point outside this pod. Keep one canonical
# Swift implementation, also compiled by the Siri app target and Swift tests.
source = File.expand_path('../../native/siri/Sources/GramelloSiri', __dir__)
destination = File.join(__dir__, 'ios', 'Generated')
FileUtils.mkdir_p(destination)
%w[MacroCheckIn.swift MacroCheckInReader.swift FoodRecommendation.swift RecommendationCatalog.swift DiaryActions.swift SavedDiaryMeal.swift WidgetSnapshot.swift WidgetPublisher.swift].each do |name|
  FileUtils.cp(File.join(source, name), File.join(destination, name))
end

Pod::Spec.new do |s|
  s.name = 'GramelloWidgets'
  s.version = '1.0.0'
  s.summary = 'On-device widget summaries for Gramello'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Gramello'
  s.homepage = 'https://gramello.com'
  s.source = { :git => 'https://github.com/edwardofclt/gramello.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSQLite'
  s.source_files = 'ios/**/*.swift'
end
