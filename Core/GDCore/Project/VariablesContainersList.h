#pragma once
#include <vector>

namespace gd {
class String;
class Project;
class Layout;
class VariablesContainer;
class Variable;
}  // namespace gd

namespace gd {

/**
 * \brief A list of variables containers, useful for accessing variables in a
 * scoped way.
 *
 * \see gd::Variable
 * \see gd::Project
 * \see gd::Layout
 *
 * \ingroup PlatformDefinition
 */
class GD_CORE_API VariablesContainersList {
 public:
  virtual ~VariablesContainersList(){};

  static VariablesContainersList
  MakeNewVariablesContainersListForProjectAndLayout(const gd::Project& project,
                                                    const gd::Layout& layout);

  static VariablesContainersList MakeNewEmptyVariablesContainersList();

  /**
   * \brief Return true if the specified variable is in one of the containers.
   */
  bool Has(const gd::String& name) const;

  /**
   * \brief Return a reference to the variable called \a name.
   */
  const Variable& Get(const gd::String& name) const;

  /**
   * \brief Return true if the specified variable container is present.
   */
  bool HasVariablesContainer(const gd::VariablesContainer& variablesContainer) const;

  /** Do not use - should be private but accessible to let Emscripten create a temporary. */
  VariablesContainersList() {};
 private:

  void Add(const gd::VariablesContainer& variablesContainer) {
    variablesContainers.push_back(&variablesContainer);
  };

  std::vector<const gd::VariablesContainer*> variablesContainers;
  static Variable badVariable;
};

}  // namespace gd